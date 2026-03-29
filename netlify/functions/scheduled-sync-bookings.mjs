// netlify/functions/scheduled-sync-bookings.mjs
// Scheduled function — runs at :25 and :55 every hour (5 min before full/half hour).
// Syncs services, clients and bookings from SimplyBook for all connected tenants.
// Manual sync (sync-booking-provider.mjs) and webhooks (simplybook-webhook.mjs)
// remain available alongside this scheduled sync.

export const config = {
  schedule: '*/5 * * * *',
}

// ── SimplyBook JSON-RPC helpers ───────────────────────────────────────────────

async function getToken(companyLogin, userLogin, apiKey) {
  const res = await fetch('https://user-api.simplybook.me/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getUserToken', params: [companyLogin, userLogin, apiKey] }),
  })
  if (!res.ok) throw new Error(`SimplyBook auth HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`SimplyBook auth: ${data.error.message || JSON.stringify(data.error)}`)
  return data.result
}

async function sbCall(method, params, companyLogin, token) {
  const res = await fetch('https://user-api.simplybook.me/admin/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Company-Login': companyLogin,
      'X-User-Token': token,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
  })
  if (!res.ok) throw new Error(`SimplyBook HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`SimplyBook ${method}: ${data.error.message || JSON.stringify(data.error)}`)
  return data.result
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler() {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) { console.error('scheduled-sync: DATABASE_URL missing'); return { statusCode: 500 } }

    const sql = neon(DATABASE_URL)

    const connections = await sql`
      SELECT id, tenant_id, provider,
             external_account_id, refresh_token_encrypted, user_login,
             COALESCE(simplybook_sms_confirmation, true) AS simplybook_sms_confirmation
      FROM provider_connections
      WHERE connection_status = 'connected'
        AND provider = 'simplybook'
    `

    if (!connections.length) {
      console.log('scheduled-sync: no connected tenants')
      return { statusCode: 200 }
    }

    console.log(`scheduled-sync: syncing ${connections.length} tenant(s)`)

    for (const conn of connections) {
      await syncTenant(sql, conn, conn.simplybook_sms_confirmation)
    }

    return { statusCode: 200 }
  } catch (e) {
    console.error('scheduled-sync fatal error:', e)
    return { statusCode: 500 }
  }
}

async function syncTenant(sql, conn, simplybookSmsConfirmation = true) {
  const TENANT_ID = conn.tenant_id
  const provider = conn.provider
  const companyLogin = conn.external_account_id
  const userLogin = conn.user_login
  const apiKey = conn.refresh_token_encrypted

  if (!companyLogin || !userLogin || !apiKey) {
    console.warn(`scheduled-sync: tenant ${TENANT_ID} missing credentials — skipping`)
    return
  }

  // Fetch tenant timezone for correct local→UTC conversion
  const tenantRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${TENANT_ID} LIMIT 1`
  const tenantTz = tenantRows[0]?.default_timezone || 'UTC'

  function localToUtc(str) {
    if (!str || !str.trim()) return null
    const cleanStr = str.trim().replace(' ', 'T')
    const approxUtc = new Date(cleanStr + 'Z')
    if (isNaN(approxUtc.getTime())) return null
    if (!tenantTz || tenantTz === 'UTC') return approxUtc
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tenantTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const parts = Object.fromEntries(fmt.formatToParts(approxUtc).map(p => [p.type, p.value]))
    const h = parts.hour === '24' ? '00' : parts.hour
    const localAtApprox = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`)
    const offsetMs = localAtApprox.getTime() - approxUtc.getTime()
    return new Date(approxUtc.getTime() - offsetMs)
  }

  let syncRunId = null

  try {
    const token = await getToken(companyLogin, userLogin, apiKey)

    await sql`
      UPDATE provider_connections
      SET access_token_encrypted = ${token}, updated_at = now()
      WHERE id = ${conn.id}
    `

    const syncRunRows = await sql`
      INSERT INTO sync_runs (tenant_id, provider_connection_id, sync_type, status)
      VALUES (${TENANT_ID}, ${conn.id}, 'scheduled', 'running')
      RETURNING id
    `
    syncRunId = syncRunRows[0].id

    let recordsProcessed = 0

    // ── Step 1: Services ────────────────────────────────────────────────────
    try {
      const serviceList = await sbCall('getEventList', [], companyLogin, token)
      const services = Array.isArray(serviceList) ? serviceList : Object.values(serviceList || {})

      for (const svc of services) {
        const externalId = String(svc.id ?? '')
        if (!externalId) continue
        await sql`
          INSERT INTO services (
            tenant_id, external_provider, external_service_id,
            name, service_type, description,
            duration_minutes, price_amount, currency,
            capacity, active
          ) VALUES (
            ${TENANT_ID}, ${provider}, ${externalId},
            ${svc.name ?? 'Unnamed service'},
            ${svc.type ?? svc.service_type ?? 'other'},
            ${svc.description ?? null},
            ${parseInt(svc.duration ?? svc.duration_minutes ?? 60, 10)},
            ${parseFloat(svc.price ?? svc.price_amount ?? 0)},
            ${svc.currency ?? 'USD'},
            ${svc.capacity ? parseInt(svc.capacity, 10) : null},
            ${svc.is_active !== false}
          )
          ON CONFLICT DO NOTHING
        `
        recordsProcessed++
      }
    } catch (svcErr) {
      console.warn(`scheduled-sync: service list fetch failed for tenant ${TENANT_ID} (non-fatal):`, svcErr?.message)
    }

    const serviceRows = await sql`
      SELECT id, external_service_id FROM services
      WHERE tenant_id = ${TENANT_ID} AND external_provider = ${provider}
    `
    const serviceMap = Object.fromEntries(serviceRows.map(r => [r.external_service_id, r.id]))

    // ── Step 2: Clients ─────────────────────────────────────────────────────
    const clientMap = {}
    {
      const clientResult = await sbCall('getClientList', ['', 500], companyLogin, token)
      const clients = Array.isArray(clientResult)
        ? clientResult
        : (clientResult?.data ?? Object.values(clientResult || {}))

      for (const client of clients) {
        const externalClientId = String(client.id ?? '')
        if (!externalClientId) continue

        const links = await sql`
          SELECT customer_id FROM booking_customer_links
          WHERE tenant_id = ${TENANT_ID}
            AND external_provider = ${provider}
            AND external_customer_id = ${externalClientId}
          LIMIT 1
        `
        if (links.length) {
          clientMap[externalClientId] = links[0].customer_id
        } else {
          const name = (client.name || client.full_name || 'Unknown').trim()
          const phone = client.phone || client.phone1 || null
          const grantConsent = simplybookSmsConfirmation && !!phone
          const newCust = await sql`
            INSERT INTO customers (tenant_id, name, customer_type, phone, sms_consent, sms_consent_at)
            VALUES (${TENANT_ID}, ${name}, 'Direct', ${phone}, ${grantConsent}, ${grantConsent ? sql`now()` : null})
            RETURNING id
          `
          const customerId = newCust[0].id
          await sql`
            INSERT INTO booking_customer_links (
              tenant_id, customer_id, external_provider, external_customer_id, raw_payload
            ) VALUES (
              ${TENANT_ID}, ${customerId}, ${provider}, ${externalClientId},
              ${JSON.stringify(client)}
            )
          `
          clientMap[externalClientId] = customerId
          recordsProcessed++
        }
      }

    }

    // ── Step 3: Bookings ────────────────────────────────────────────────────
    const now = new Date()
    const dateFrom = new Date(now); dateFrom.setDate(dateFrom.getDate() - 30)
    const dateTo = new Date(now); dateTo.setDate(dateTo.getDate() + 90)
    const fmt = d => d.toISOString().slice(0, 10)
    const filter = { date_from: fmt(dateFrom), date_to: fmt(dateTo) }

    {
      const bookingResult = await sbCall('getBookings', [filter], companyLogin, token)
      const bookings = Array.isArray(bookingResult)
        ? bookingResult
        : (bookingResult?.data ?? Object.values(bookingResult || {}))

      for (const bk of bookings) {
        const externalBookingId = String(bk.id ?? '')
        if (!externalBookingId) continue

        const customerId = clientMap[String(bk.client_id ?? '')] ?? null
        const serviceId = serviceMap[String(bk.event_id ?? bk.service_id ?? '')] ?? null

        const startStr = bk.start_date_time ?? bk.start_date ?? `${bk.date ?? ''} ${bk.start_time ?? '00:00:00'}`
        const endStr = bk.end_date_time ?? bk.end_date ?? `${bk.date ?? ''} ${bk.end_time ?? '00:00:00'}`
        const startAt = startStr.trim() ? localToUtc(startStr) : null
        const endAt = endStr.trim() ? localToUtc(endStr) : null
        if (!startAt || isNaN(startAt.getTime())) continue

        const rawStatus = bk.status != null ? String(bk.status).toLowerCase()
          : (bk.is_confirm === '1' || bk.is_confirm === 1) ? 'approved'
          : (bk.is_confirm === '0' || bk.is_confirm === 0) ? 'pending'
          : 'approved'
        const bookingStatus =
          rawStatus === 'cancelled' || rawStatus === 'canceled' ? 'canceled'
          : rawStatus === 'pending' ? 'pending'
          : rawStatus === 'approved' || rawStatus === 'confirmed' ? 'confirmed'
          : rawStatus === 'completed' ? 'completed'
          : 'confirmed'

        const totalAmount = bk.invoice_amount != null ? parseFloat(bk.invoice_amount)
          : bk.event_price != null ? parseFloat(bk.event_price)
          : bk.total_amount_due != null ? parseFloat(bk.total_amount_due)
          : bk.total_price != null ? parseFloat(bk.total_price) : null
        const paidAmount = bk.payed_amount != null ? parseFloat(bk.payed_amount)
          : bk.paid_amount != null ? parseFloat(bk.paid_amount) : 0
        const paymentStatus =
          totalAmount == null ? 'unpaid'
          : paidAmount >= totalAmount ? 'paid'
          : paidAmount > 0 ? 'deposit_paid'
          : 'unpaid'

        await sql`
          INSERT INTO bookings (
            tenant_id, provider_connection_id, external_provider, external_booking_id,
            external_status, customer_id, service_id,
            assigned_staff_name, booking_status, payment_status,
            start_at, end_at, participant_count, total_amount, currency,
            notes, raw_payload
          ) VALUES (
            ${TENANT_ID}, ${conn.id}, ${provider}, ${externalBookingId},
            ${bk.status ?? bk.is_confirm ?? null}, ${customerId}, ${serviceId},
            ${bk.unit ?? bk.unit_name ?? bk.staff_name ?? null},
            ${bookingStatus}, ${paymentStatus},
            ${startAt.toISOString()}, ${endAt ? endAt.toISOString() : startAt.toISOString()},
            ${parseInt(bk.participant_count ?? bk.count ?? 1, 10)},
            ${totalAmount}, ${bk.event_currency ?? bk.currency ?? null},
            ${bk.comment ?? bk.notes ?? bk.note ?? null},
            ${JSON.stringify(bk)}
          )
          ON CONFLICT (tenant_id, external_provider, external_booking_id) WHERE external_booking_id IS NOT NULL
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
        `
        recordsProcessed++
      }

    }

    // ── Cleanup canceled/stale message_jobs ─────────────────────────────────
    await sql`
      UPDATE message_jobs mj
      SET status = 'canceled', error_message = 'Booking canceled', updated_at = now()
      WHERE mj.tenant_id = ${TENANT_ID}
        AND mj.status = 'queued'
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = mj.booking_id AND b.booking_status = 'canceled'
        )
    `
    await sql`
      UPDATE message_jobs mj
      SET status = 'canceled', error_message = 'Booking rescheduled — stale reminder', updated_at = now()
      WHERE mj.tenant_id = ${TENANT_ID}
        AND mj.status = 'queued'
        AND mj.scheduled_for < now()
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = mj.booking_id
            AND b.booking_status NOT IN ('canceled')
            AND b.start_at > now()
        )
    `

    // ── Schedule reminders ───────────────────────────────────────────────────
    try {
      const activeRules = await sql`
        SELECT id, trigger_event, minutes_offset, channel, template_key, service_id
        FROM reminder_rules
        WHERE tenant_id = ${TENANT_ID} AND active = true
      `
      if (activeRules.length) {
        const upcomingBookings = await sql`
          SELECT id, start_at, booking_status, payment_status, customer_id, service_id
          FROM bookings
          WHERE tenant_id = ${TENANT_ID}
            AND booking_status NOT IN ('canceled')
            AND start_at >= now()
          LIMIT 500
        `
        const nowMs = Date.now()
        for (const booking of upcomingBookings) {
          for (const rule of activeRules) {
            if (rule.service_id && rule.service_id !== booking.service_id) continue
            let scheduledFor
            if (rule.trigger_event === 'before_start') {
              scheduledFor = new Date(new Date(booking.start_at).getTime() + rule.minutes_offset * 60000)
            } else if (rule.trigger_event === 'booking_confirmed') {
              if (!simplybookSmsConfirmation) continue
              scheduledFor = new Date(nowMs + rule.minutes_offset * 60000)
            } else if (rule.trigger_event === 'unpaid_balance') {
              if (booking.payment_status === 'paid') continue
              scheduledFor = new Date(new Date(booking.start_at).getTime() + rule.minutes_offset * 60000)
            } else {
              continue
            }
            if (scheduledFor.getTime() <= nowMs) continue
            await sql`
              INSERT INTO message_jobs (
                tenant_id, booking_id, customer_id, channel, template_key,
                scheduled_for, status, billable, stripe_reported
              ) VALUES (
                ${TENANT_ID}, ${booking.id}, ${booking.customer_id},
                ${rule.channel}, ${rule.template_key},
                ${scheduledFor.toISOString()}, 'queued', false, false
              )
              ON CONFLICT (tenant_id, booking_id, template_key, channel, scheduled_for)
                DO NOTHING
            `
          }
        }
      }
    } catch (reminderErr) {
      console.warn(`scheduled-sync: reminder scheduling failed for tenant ${TENANT_ID} (non-fatal):`, reminderErr?.message)
    }

    await sql`
      UPDATE provider_connections SET last_sync_at = now(), updated_at = now() WHERE id = ${conn.id}
    `
    await sql`
      UPDATE sync_runs SET status = 'succeeded', finished_at = now(), records_processed = ${recordsProcessed}
      WHERE id = ${syncRunId}
    `

    console.log(`scheduled-sync: tenant ${TENANT_ID} done — ${recordsProcessed} records`)
  } catch (e) {
    console.error(`scheduled-sync: tenant ${TENANT_ID} failed:`, e)
    if (syncRunId) {
      await sql`
        UPDATE sync_runs SET status = 'failed', finished_at = now(),
          error_message = ${String(e?.message || e)}
        WHERE id = ${syncRunId}
      `.catch(() => {})
    }
  }
}
