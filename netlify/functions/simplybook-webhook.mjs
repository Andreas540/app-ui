// netlify/functions/simplybook-webhook.mjs
// POST /api/simplybook-webhook
// Receives real-time booking events pushed by SimplyBook.
// SimplyBook must be configured with this URL under Settings → Webhooks.
// Optionally set SIMPLYBOOK_WEBHOOK_SECRET in Netlify env vars and add
// ?secret=<value> to the webhook URL in SimplyBook for basic request auth.

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' })

  try {
    // Optional shared-secret check
    const { SIMPLYBOOK_WEBHOOK_SECRET, DATABASE_URL } = process.env
    if (SIMPLYBOOK_WEBHOOK_SECRET) {
      const qs = event.queryStringParameters || {}
      if (qs.secret !== SIMPLYBOOK_WEBHOOK_SECRET) {
        return resp(401, { error: 'Unauthorized' })
      }
    }

    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')

    const payload = JSON.parse(rawBody)
    console.log('simplybook-webhook payload:', JSON.stringify(payload))

    // SimplyBook sends company_login so we can look up the tenant
    const companyLogin = payload.company_login || payload.company
    if (!companyLogin) return resp(400, { error: 'Missing company_login in payload' })

    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(DATABASE_URL)

    // Find the provider connection by company login
    const conns = await sql`
      SELECT id, tenant_id, refresh_token_encrypted, user_login
      FROM provider_connections
      WHERE external_account_id = ${companyLogin}
        AND provider = 'simplybook'
        AND connection_status = 'connected'
      LIMIT 1
    `
    if (!conns.length) {
      console.warn(`simplybook-webhook: no connected tenant for company_login=${companyLogin}`)
      // Return 200 so SimplyBook doesn't retry — we just don't have this tenant
      return resp(200, { ok: true, skipped: true })
    }

    const conn = conns[0]
    const TENANT_ID = conn.tenant_id
    const provider = 'simplybook'

    // Determine the action
    // SimplyBook sends: new_booking | update_booking | cancel_booking (or similar)
    const action = (payload.action || payload.event || '').toLowerCase()

    if (!action) {
      console.warn('simplybook-webhook: no action in payload')
      return resp(200, { ok: true, skipped: true })
    }

    // ── Cancellation ─────────────────────────────────────────────────────────
    if (action.includes('cancel')) {
      const externalBookingId = String(payload.booking_id ?? payload.id ?? '')
      if (externalBookingId) {
        await sql`
          UPDATE bookings
          SET
            booking_status = 'canceled',
            external_status = 'cancelled',
            raw_payload = ${JSON.stringify(payload)},
            updated_at = now()
          WHERE tenant_id = ${TENANT_ID}
            AND external_provider = ${provider}
            AND external_booking_id = ${externalBookingId}
        `
        // Cancel any queued message_jobs for this booking
        await sql`
          UPDATE message_jobs
          SET status = 'canceled', error_message = 'Booking canceled', updated_at = now()
          WHERE tenant_id = ${TENANT_ID}
            AND status = 'queued'
            AND booking_id IN (
              SELECT id FROM bookings
              WHERE tenant_id = ${TENANT_ID}
                AND external_provider = ${provider}
                AND external_booking_id = ${externalBookingId}
            )
        `
        console.log(`simplybook-webhook: canceled booking ${externalBookingId} for tenant ${TENANT_ID}`)
      }
      return resp(200, { ok: true })
    }

    // ── New or updated booking ────────────────────────────────────────────────
    if (action.includes('booking')) {
      const bk = payload

      const externalBookingId = String(bk.booking_id ?? bk.id ?? '')
      if (!externalBookingId) return resp(200, { ok: true, skipped: true })

      const externalClientId = String(bk.client_id ?? '')
      const externalServiceId = String(bk.service_id ?? '')

      // ── Resolve customer ──────────────────────────────────────────────────
      let customerId = null
      if (externalClientId) {
        const links = await sql`
          SELECT customer_id
          FROM booking_customer_links
          WHERE tenant_id = ${TENANT_ID}
            AND external_provider = ${provider}
            AND external_customer_id = ${externalClientId}
          LIMIT 1
        `
        if (links.length) {
          customerId = links[0].customer_id
        } else {
          // Create customer from payload
          const name = (bk.client_name || bk.client?.name || bk.client?.full_name || 'Unknown').trim()
          const phone = bk.client_phone || bk.client?.phone || bk.client?.phone1 || null
          const newCust = await sql`
            INSERT INTO customers (tenant_id, name, customer_type, phone, sms_consent, sms_consent_at)
            VALUES (${TENANT_ID}, ${name}, 'Direct', ${phone}, false, null)
            RETURNING id
          `
          customerId = newCust[0].id
          await sql`
            INSERT INTO booking_customer_links (
              tenant_id, customer_id, external_provider, external_customer_id, raw_payload
            ) VALUES (
              ${TENANT_ID}, ${customerId}, ${provider}, ${externalClientId},
              ${JSON.stringify(bk.client ?? {})}
            )
          `
        }
      }

      // ── Resolve service ───────────────────────────────────────────────────
      let serviceId = null
      if (externalServiceId) {
        const svcRows = await sql`
          SELECT id FROM services
          WHERE tenant_id = ${TENANT_ID}
            AND external_provider = ${provider}
            AND external_service_id = ${externalServiceId}
          LIMIT 1
        `
        serviceId = svcRows[0]?.id ?? null
      }

      // ── Build timestamps ──────────────────────────────────────────────────
      const startStr = bk.start_date_time ?? `${bk.date ?? bk.start_date ?? ''} ${bk.start_time ?? '00:00:00'}`
      const endStr = bk.end_date_time ?? `${bk.date ?? bk.end_date ?? ''} ${bk.end_time ?? '00:00:00'}`
      const startAt = startStr.trim() ? new Date(startStr.replace(' ', 'T') + 'Z') : null
      const endAt = endStr.trim() ? new Date(endStr.replace(' ', 'T') + 'Z') : null
      if (!startAt || isNaN(startAt.getTime())) {
        console.warn(`simplybook-webhook: unparseable date for booking ${externalBookingId}`)
        return resp(200, { ok: true, skipped: true })
      }

      // ── Status mapping ────────────────────────────────────────────────────
      const rawStatus = (bk.status ?? 'approved').toLowerCase()
      const bookingStatus =
        rawStatus === 'cancelled' || rawStatus === 'canceled' ? 'canceled'
        : rawStatus === 'pending' ? 'pending'
        : rawStatus === 'approved' || rawStatus === 'confirmed' ? 'confirmed'
        : rawStatus === 'completed' ? 'completed'
        : 'confirmed'

      const totalAmount = bk.total_amount_due != null
        ? parseFloat(bk.total_amount_due)
        : bk.total_price != null ? parseFloat(bk.total_price) : null
      const paidAmount = bk.paid_amount != null ? parseFloat(bk.paid_amount) : 0
      const paymentStatus =
        totalAmount == null ? 'unpaid'
        : paidAmount >= totalAmount ? 'paid'
        : paidAmount > 0 ? 'deposit_paid'
        : 'unpaid'

      // ── Upsert booking ────────────────────────────────────────────────────
      const bookingRows = await sql`
        INSERT INTO bookings (
          tenant_id, provider_connection_id, external_provider, external_booking_id,
          external_status, customer_id, service_id,
          assigned_staff_name, booking_status, payment_status,
          start_at, end_at, participant_count, total_amount, currency,
          notes, raw_payload
        ) VALUES (
          ${TENANT_ID}, ${conn.id}, ${provider}, ${externalBookingId},
          ${bk.status ?? null}, ${customerId}, ${serviceId},
          ${bk.unit_name ?? bk.staff_name ?? null},
          ${bookingStatus}, ${paymentStatus},
          ${startAt.toISOString()}, ${endAt ? endAt.toISOString() : startAt.toISOString()},
          ${parseInt(bk.participant_count ?? bk.count ?? 1, 10)},
          ${totalAmount}, ${bk.currency ?? null},
          ${bk.notes ?? bk.note ?? null},
          ${JSON.stringify(bk)}
        )
        ON CONFLICT (tenant_id, external_provider, external_booking_id)
          DO UPDATE SET
            external_status     = EXCLUDED.external_status,
            customer_id         = COALESCE(EXCLUDED.customer_id, bookings.customer_id),
            service_id          = COALESCE(EXCLUDED.service_id, bookings.service_id),
            assigned_staff_name = EXCLUDED.assigned_staff_name,
            booking_status      = EXCLUDED.booking_status,
            payment_status      = EXCLUDED.payment_status,
            start_at            = EXCLUDED.start_at,
            end_at              = EXCLUDED.end_at,
            participant_count   = EXCLUDED.participant_count,
            total_amount        = EXCLUDED.total_amount,
            currency            = EXCLUDED.currency,
            notes               = EXCLUDED.notes,
            raw_payload         = EXCLUDED.raw_payload,
            updated_at          = now()
        RETURNING id, booking_status, start_at, customer_id, service_id
      `
      const savedBooking = bookingRows[0]

      // ── Cancel queued jobs for canceled bookings ──────────────────────────
      if (bookingStatus === 'canceled') {
        await sql`
          UPDATE message_jobs
          SET status = 'canceled', error_message = 'Booking canceled', updated_at = now()
          WHERE tenant_id = ${TENANT_ID}
            AND booking_id = ${savedBooking.id}
            AND status = 'queued'
        `
      }

      // ── Schedule reminders for new/updated confirmed bookings ─────────────
      if (bookingStatus !== 'canceled' && startAt > new Date()) {
        try {
          const activeRules = await sql`
            SELECT id, trigger_event, minutes_offset, channel, template_key, service_id
            FROM reminder_rules
            WHERE tenant_id = ${TENANT_ID} AND active = true
          `
          const nowMs = Date.now()
          for (const rule of activeRules) {
            if (rule.service_id && rule.service_id !== savedBooking.service_id) continue

            let scheduledFor
            if (rule.trigger_event === 'before_start') {
              scheduledFor = new Date(startAt.getTime() + rule.minutes_offset * 60000)
            } else if (rule.trigger_event === 'booking_confirmed') {
              scheduledFor = new Date(nowMs + rule.minutes_offset * 60000)
            } else if (rule.trigger_event === 'unpaid_balance') {
              if (paymentStatus === 'paid') continue
              scheduledFor = new Date(startAt.getTime() + rule.minutes_offset * 60000)
            } else {
              continue
            }
            if (scheduledFor.getTime() <= nowMs) continue

            await sql`
              INSERT INTO message_jobs (
                tenant_id, booking_id, customer_id, channel, template_key,
                scheduled_for, status, billable, stripe_reported
              ) VALUES (
                ${TENANT_ID}, ${savedBooking.id}, ${savedBooking.customer_id},
                ${rule.channel}, ${rule.template_key},
                ${scheduledFor.toISOString()}, 'queued', false, false
              )
              ON CONFLICT (tenant_id, booking_id, template_key, channel, scheduled_for)
                DO NOTHING
            `
          }
        } catch (reminderErr) {
          console.warn('simplybook-webhook: reminder scheduling failed (non-fatal):', reminderErr?.message)
        }
      }

      console.log(`simplybook-webhook: upserted booking ${externalBookingId} (${bookingStatus}) for tenant ${TENANT_ID}`)
      return resp(200, { ok: true })
    }

    // Unknown action — acknowledge to avoid retries
    console.log(`simplybook-webhook: unhandled action "${action}"`)
    return resp(200, { ok: true, skipped: true })

  } catch (e) {
    console.error('simplybook-webhook error:', e)
    return resp(500, { error: String(e?.message || e) })
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}
