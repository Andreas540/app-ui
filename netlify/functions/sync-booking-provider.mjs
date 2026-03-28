// netlify/functions/sync-booking-provider.mjs
// POST /api/sync-booking-provider
// Body: { provider: 'simplybook' }
// Pulls services, clients and bookings from SimplyBook, upserts into our DB.
// Updates provider_connections.last_sync_at and logs a sync_runs row.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return runSync(event)
  return cors(405, { error: 'Method not allowed' })
}

// ── SimplyBook JSON-RPC helper ─────────────────────────────────────────────

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

// ── Main sync handler ──────────────────────────────────────────────────────

async function runSync(event) {
  let syncRunId = null
  let sql = null

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const body = JSON.parse(rawBody)
    const provider = body.provider || 'simplybook'
    if (provider !== 'simplybook') return cors(400, { error: 'Unsupported provider' })

    // Load provider connection
    const conns = await sql`
      SELECT id, external_account_id, access_token_encrypted, refresh_token_encrypted, user_login, connection_status
      FROM provider_connections
      WHERE tenant_id = ${TENANT_ID} AND provider = ${provider}
      LIMIT 1
    `
    if (!conns.length) return cors(404, { error: 'No provider connection found' })
    const conn = conns[0]
    if (conn.connection_status !== 'connected') return cors(400, { error: 'Provider is not connected' })

    const companyLogin = conn.external_account_id
    const userLogin = conn.user_login
    const apiKey = conn.refresh_token_encrypted // stored at connect time

    if (!companyLogin || !userLogin || !apiKey) return cors(400, { error: 'Missing credentials — please reconnect' })

    // Get a fresh token (avoids expiry issues)
    const token = await getToken(companyLogin, userLogin, apiKey)

    // Store refreshed token
    await sql`
      UPDATE provider_connections
      SET access_token_encrypted = ${token}, updated_at = now()
      WHERE id = ${conn.id}
    `

    // Open a sync_runs record
    const syncRunRows = await sql`
      INSERT INTO sync_runs (tenant_id, provider_connection_id, sync_type, status)
      VALUES (${TENANT_ID}, ${conn.id}, 'incremental', 'running')
      RETURNING id
    `
    syncRunId = syncRunRows[0].id

    // Fetch tenant timezone for correct local→UTC conversion
    const tenantRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${TENANT_ID} LIMIT 1`
    const tenantTz = tenantRows[0]?.default_timezone || 'UTC'

    // Convert a SimplyBook local datetime string to UTC using the tenant's IANA timezone.
    // SimplyBook stores times in the company's local timezone; bk.offset is unreliable.
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

    let servicesProcessed = 0
    let clientsProcessed = 0
    let bookingsProcessed = 0
    let ordersCreated = 0
    let paymentsCreated = 0

    // ── Step 1: Sync services ──────────────────────────────────────────────
    try {
      const serviceList = await sbCall('getEventList', [], companyLogin, token)
      // Returns object keyed by service id or an array — handle both
      const services = Array.isArray(serviceList)
        ? serviceList
        : Object.values(serviceList || {})

      console.log(`sync: getEventList returned ${services.length} services`)

      for (const svc of services) {
        const externalId = String(svc.id ?? '')
        if (!externalId) continue

        const svcName = svc.name ?? 'Unnamed service'
        const svcType = svc.type ?? svc.service_type ?? 'other'
        const svcDesc = svc.description ?? null
        const svcDuration = parseInt(svc.duration ?? svc.duration_minutes ?? 60, 10)
        const svcPrice = parseFloat(svc.price ?? svc.price_amount ?? 0)
        const svcCurrency = svc.currency ?? 'USD'
        const svcCapacity = svc.capacity ? parseInt(svc.capacity, 10) : null
        const svcActive = svc.is_active !== false

        const svcRow = await sql`
          INSERT INTO services (
            tenant_id, external_provider, external_service_id,
            name, service_type, description,
            duration_minutes, price_amount, currency,
            capacity, active
          ) VALUES (
            ${TENANT_ID}, ${provider}, ${externalId},
            ${svcName}, ${svcType}, ${svcDesc},
            ${svcDuration}, ${svcPrice}, ${svcCurrency},
            ${svcCapacity}, ${svcActive}
          )
          ON CONFLICT (tenant_id, external_provider, external_service_id) WHERE external_service_id IS NOT NULL
          DO UPDATE SET
            name             = EXCLUDED.name,
            service_type     = EXCLUDED.service_type,
            description      = EXCLUDED.description,
            duration_minutes = EXCLUDED.duration_minutes,
            price_amount     = EXCLUDED.price_amount,
            currency         = EXCLUDED.currency,
            capacity         = EXCLUDED.capacity,
            active           = EXCLUDED.active
          RETURNING id
        `
        const svcId = svcRow[0].id

        // Mirror into unified products table (category='service', same UUID)
        await sql`
          INSERT INTO products (
            id, tenant_id, name, category,
            external_provider, external_service_id, service_type, description,
            duration_minutes, price_amount, currency, capacity, active
          ) VALUES (
            ${svcId}, ${TENANT_ID}, ${svcName}, 'service',
            ${provider}, ${externalId}, ${svcType}, ${svcDesc},
            ${svcDuration}, ${svcPrice}, ${svcCurrency}, ${svcCapacity}, ${svcActive}
          )
          ON CONFLICT (id) DO UPDATE SET
            name             = EXCLUDED.name,
            service_type     = EXCLUDED.service_type,
            description      = EXCLUDED.description,
            duration_minutes = EXCLUDED.duration_minutes,
            price_amount     = EXCLUDED.price_amount,
            currency         = EXCLUDED.currency,
            capacity         = EXCLUDED.capacity,
            active           = EXCLUDED.active
        `
        servicesProcessed++
      }
    } catch (svcErr) {
      console.warn('sync: service list fetch failed (non-fatal):', svcErr?.message)
    }

    // Build service lookup: externalServiceId → { id, price_amount }
    const serviceRows = await sql`
      SELECT id, external_service_id, price_amount
      FROM services
      WHERE tenant_id = ${TENANT_ID} AND external_provider = ${provider}
    `
    const serviceMap = Object.fromEntries(serviceRows.map(r => [r.external_service_id, { id: r.id, price: r.price_amount }]))

    // ── Step 2: Sync clients → customers ──────────────────────────────────
    // getClientList(searchString, limit) — no pagination, fetch up to 500
    const clientMap = {} // externalClientId → our customer_id
    const clientResult = await sbCall('getClientList', ['', 500], companyLogin, token)
    console.log('sync: getClientList raw type:', typeof clientResult, '| isArray:', Array.isArray(clientResult), '| keys:', clientResult && typeof clientResult === 'object' ? JSON.stringify(Object.keys(clientResult).slice(0, 10)) : String(clientResult))
    const clients = Array.isArray(clientResult)
      ? clientResult
      : Object.values(clientResult || {})

    for (const client of clients) {
      const externalClientId = String(client.id ?? '')
      if (!externalClientId) continue

      const links = await sql`
        SELECT customer_id
        FROM booking_customer_links
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
        const newCust = await sql`
          INSERT INTO customers (
            tenant_id, name, customer_type, phone,
            sms_consent, sms_consent_at
          ) VALUES (
            ${TENANT_ID}, ${name}, 'Direct', ${phone},
            false, null
          )
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
        clientsProcessed++
      }
    }
    if (clients.length > 0) console.log('sync: first client keys:', JSON.stringify(Object.keys(clients[0])), '| id field:', clients[0]?.id)
    console.log(`sync: getClientList returned ${Object.keys(clientMap).length} clients`)

    // ── Step 3: Sync bookings ──────────────────────────────────────────────
    // getBookings(filter) — returns all matching bookings, no pagination
    const now = new Date()
    const dateFrom = new Date(now)
    dateFrom.setDate(dateFrom.getDate() - 30)
    const dateTo = new Date(now)
    dateTo.setDate(dateTo.getDate() + 90)

    const fmt = d => d.toISOString().slice(0, 10)

    const filter = { date_from: fmt(dateFrom), date_to: fmt(dateTo) }

    const bookingResult = await sbCall('getBookings', [filter], companyLogin, token)
    console.log('sync: getBookings raw type:', typeof bookingResult, '| isArray:', Array.isArray(bookingResult), '| keys:', bookingResult && typeof bookingResult === 'object' ? JSON.stringify(Object.keys(bookingResult).slice(0, 10)) : String(bookingResult))
    const allBookings = Array.isArray(bookingResult)
      ? bookingResult
      : (bookingResult?.data ?? Object.values(bookingResult || {}))

    console.log(`sync: getBookings returned ${allBookings.length} bookings`)
    if (allBookings.length > 0) {
      const first = allBookings[0]
      console.log('sync: first booking keys:', JSON.stringify(Object.keys(first)))
      console.log('sync: first booking offset:', first.offset, '| start_date:', first.start_date, '| client_timezone:', first.client_timezone)
    }

    for (const bk of allBookings) {
        const externalBookingId = String(bk.id ?? bk.booking_id ?? bk.record_id ?? '')
        if (!externalBookingId) continue

        const externalClientId = String(bk.client_id ?? '')
        // SimplyBook uses event_id for the service
        const externalServiceId = String(bk.event_id ?? bk.service_id ?? '')

        const customerId = clientMap[externalClientId] ?? null
        const serviceEntry = serviceMap[externalServiceId] ?? null
        const serviceId = serviceEntry?.id ?? null
        const servicePrice = serviceEntry?.price ?? null
        if (!serviceId) console.warn(`sync: booking ${externalBookingId} — no service match for event_id="${externalServiceId}" (keys in bk: event_id=${bk.event_id}, service_id=${bk.service_id})`)

        // start_date / end_date already contain "YYYY-MM-DD HH:MM:SS" in company local time
        const startStr = bk.start_date_time ?? bk.start_date ?? `${bk.date ?? ''} ${bk.start_time ?? '00:00:00'}`
        const endStr = bk.end_date_time ?? bk.end_date ?? `${bk.date ?? ''} ${bk.end_time ?? '00:00:00'}`

        const startAt = startStr.trim() ? localToUtc(startStr) : null
        const endAt = endStr.trim() ? localToUtc(endStr) : null
        if (!startAt || isNaN(startAt.getTime())) continue

        // is_confirm: "1" = confirmed, "0" = pending; fallback to status field
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

        // payed_amount is SimplyBook's field name (their typo)
        // Fall back to the service's stored price if SimplyBook doesn't send an amount
        const totalAmount = bk.invoice_amount != null ? parseFloat(bk.invoice_amount)
          : bk.event_price != null ? parseFloat(bk.event_price)
          : bk.total_amount_due != null ? parseFloat(bk.total_amount_due)
          : bk.total_price != null ? parseFloat(bk.total_price)
          : servicePrice
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
            assigned_staff_name,
            booking_status, payment_status,
            start_at, end_at,
            participant_count, total_amount, currency,
            notes, raw_payload
          ) VALUES (
            ${TENANT_ID}, ${conn.id}, ${provider}, ${externalBookingId},
            ${bk.status ?? bk.is_confirm ?? null},
            ${customerId}, ${serviceId},
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
              external_status  = EXCLUDED.external_status,
              customer_id      = COALESCE(EXCLUDED.customer_id, bookings.customer_id),
              service_id       = COALESCE(EXCLUDED.service_id, bookings.service_id),
              assigned_staff_name = EXCLUDED.assigned_staff_name,
              booking_status   = EXCLUDED.booking_status,
              payment_status   = EXCLUDED.payment_status,
              start_at         = EXCLUDED.start_at,
              end_at           = EXCLUDED.end_at,
              participant_count = EXCLUDED.participant_count,
              total_amount     = EXCLUDED.total_amount,
              currency         = EXCLUDED.currency,
              notes            = EXCLUDED.notes,
              raw_payload      = EXCLUDED.raw_payload,
              updated_at       = now()
        `
        bookingsProcessed++

        // ── Create order + payment if not yet linked ───────────────────────
        // Best-effort: errors here don't fail the sync.
        if (bookingStatus !== 'canceled' && customerId) {
          try {
            const bookingRow = await sql`
              SELECT id, order_id FROM bookings
              WHERE tenant_id = ${TENANT_ID}
                AND external_provider = ${provider}
                AND external_booking_id = ${externalBookingId}
              LIMIT 1
            `
            const bookingId = bookingRow[0]?.id
            let orderId = bookingRow[0]?.order_id
            // Fall back to service_id stored on the booking if current sync didn't map it
            const effectiveServiceId = serviceId ?? bookingRow[0]?.service_id ?? null

            if (bookingId && !orderId) {
              // Atomically get the next order number.
              // On first use, initialize to current max so we never collide with existing orders.
              const counterRow = await sql`
                INSERT INTO tenant_order_counters (tenant_id, last_order_no)
                VALUES (
                  ${TENANT_ID},
                  (SELECT COALESCE(MAX(order_no), 0) + 1 FROM orders WHERE tenant_id = ${TENANT_ID})
                )
                ON CONFLICT (tenant_id) DO UPDATE
                  SET last_order_no = GREATEST(
                    EXCLUDED.last_order_no,
                    tenant_order_counters.last_order_no + 1
                  )
                RETURNING last_order_no
              `
              const orderNo = counterRow[0].last_order_no

              const orderRow = await sql`
                INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, booking_id)
                VALUES (
                  ${TENANT_ID}, ${customerId}, ${orderNo},
                  ${startAt.toISOString().slice(0, 10)},
                  FALSE, ${bookingId}
                )
                RETURNING id
              `
              orderId = orderRow[0].id

              // Link booking → order
              await sql`UPDATE bookings SET order_id = ${orderId} WHERE id = ${bookingId}`
              ordersCreated++
            }

            // Service line item — add if missing (order may exist from a prior sync attempt)
            if (bookingId && orderId && effectiveServiceId) {
              const existingItem = await sql`
                SELECT id FROM order_items WHERE order_id = ${orderId} LIMIT 1
              `
              if (!existingItem.length) {
                await sql`
                  INSERT INTO order_items (order_id, product_id, service_id, qty, unit_price)
                  VALUES (${orderId}, ${effectiveServiceId}, ${effectiveServiceId}, 1, ${totalAmount ?? 0})
                `
              }
            }

            // Create payment record for any amount already collected
            if (bookingId && paidAmount > 0) {
              const existing = await sql`
                SELECT id, order_id FROM payments WHERE booking_id = ${bookingId} LIMIT 1
              `
              // Backfill order_id on existing payment if it was created before order linking
              if (existing.length && !existing[0].order_id && orderId) {
                await sql`
                  UPDATE payments SET order_id = ${orderId}
                  WHERE id = ${existing[0].id}
                `
              }
              if (!existing.length) {
                await sql`
                  INSERT INTO payments (
                    tenant_id, customer_id, payment_type,
                    amount, payment_date,
                    order_id, booking_id, notes
                  ) VALUES (
                    ${TENANT_ID}, ${customerId}, 'booking',
                    ${paidAmount}, ${startAt.toISOString().slice(0, 10)},
                    ${orderId ?? null}, ${bookingId},
                    ${'Booking #' + externalBookingId}
                  )
                `
                paymentsCreated++
              }
            }
          } catch (orderErr) {
            console.warn(`sync: order/payment creation failed for booking ${externalBookingId} (non-fatal):`, orderErr?.message)
          }
        }
      }

    // ── Backfill: set product_id = service_id for items that missed it ──────
    await sql`
      UPDATE order_items oi
      SET product_id = oi.service_id
      WHERE oi.service_id IS NOT NULL
        AND oi.product_id IS NULL
        AND EXISTS (SELECT 1 FROM products p WHERE p.id = oi.service_id AND p.tenant_id = ${TENANT_ID})
    `

    // ── Backfill: create orders for bookings that are missing one ───────────
    // This catches bookings where order creation previously failed (e.g. duplicate key bug)
    // or bookings synced before order creation logic existed. Runs on every sync so it
    // self-heals regardless of which date window the sync covers.
    try {
      const unlinked = await sql`
        SELECT b.id, b.customer_id, b.service_id, b.start_at, b.total_amount
        FROM bookings b
        WHERE b.tenant_id = ${TENANT_ID}
          AND b.order_id IS NULL
          AND b.booking_status != 'canceled'
          AND b.customer_id IS NOT NULL
      `
      for (const b of unlinked) {
        try {
          const counterRow = await sql`
            INSERT INTO tenant_order_counters (tenant_id, last_order_no)
            VALUES (
              ${TENANT_ID},
              (SELECT COALESCE(MAX(order_no), 0) + 1 FROM orders WHERE tenant_id = ${TENANT_ID})
            )
            ON CONFLICT (tenant_id) DO UPDATE
              SET last_order_no = GREATEST(
                EXCLUDED.last_order_no,
                tenant_order_counters.last_order_no + 1
              )
            RETURNING last_order_no
          `
          const orderRow = await sql`
            INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, booking_id)
            VALUES (
              ${TENANT_ID}, ${b.customer_id}, ${counterRow[0].last_order_no},
              ${new Date(b.start_at).toISOString().slice(0, 10)},
              FALSE, ${b.id}
            )
            RETURNING id
          `
          const orderId = orderRow[0].id
          await sql`UPDATE bookings SET order_id = ${orderId} WHERE id = ${b.id}`
          if (b.service_id) {
            await sql`
              INSERT INTO order_items (order_id, product_id, service_id, qty, unit_price)
              VALUES (${orderId}, ${b.service_id}, ${b.service_id}, 1, ${b.total_amount ?? 0})
              ON CONFLICT DO NOTHING
            `
          }
          ordersCreated++
          console.log(`sync: backfilled order for booking ${b.id}`)
        } catch (err) {
          console.warn(`sync: backfill order failed for booking ${b.id}:`, err?.message)
        }
      }
    } catch (err) {
      console.warn('sync: backfill query failed (non-fatal):', err?.message)
    }

    // ── Job cleanup: canceled and rescheduled bookings ─────────────────────
    // Cancel queued message_jobs for bookings that are now canceled.
    const canceledCleanup = await sql`
      UPDATE message_jobs mj
      SET
        status        = 'canceled',
        error_message = 'Booking canceled',
        updated_at    = now()
      WHERE mj.tenant_id = ${TENANT_ID}
        AND mj.status   = 'queued'
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = mj.booking_id
            AND b.booking_status = 'canceled'
        )
    `

    // Cancel queued before_start jobs that are now past the booking's start_at
    // (indicates the booking was rescheduled earlier and the old reminder window is stale).
    const staleCleanup = await sql`
      UPDATE message_jobs mj
      SET
        status        = 'canceled',
        error_message = 'Booking rescheduled — stale reminder',
        updated_at    = now()
      WHERE mj.tenant_id    = ${TENANT_ID}
        AND mj.status       = 'queued'
        AND mj.scheduled_for < now()
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = mj.booking_id
            AND b.booking_status NOT IN ('canceled')
            AND b.start_at > now()
        )
    `

    const cleanedCount = (canceledCleanup.length ?? 0) + (staleCleanup.length ?? 0)
    if (cleanedCount > 0) {
      console.log(`sync: cleaned up ${cleanedCount} stale message_jobs`)
    }

    // ── Finalise ───────────────────────────────────────────────────────────
    await sql`
      UPDATE provider_connections
      SET last_sync_at = now(), updated_at = now()
      WHERE id = ${conn.id}
    `

    const recordsProcessed = servicesProcessed + clientsProcessed + bookingsProcessed
    console.log(`sync: services=${servicesProcessed} clients=${clientsProcessed} bookings=${bookingsProcessed} orders=${ordersCreated} payments=${paymentsCreated}`)

    await sql`
      UPDATE sync_runs
      SET status = 'succeeded', finished_at = now(), records_processed = ${recordsProcessed}
      WHERE id = ${syncRunId}
    `

    // ── Schedule reminders for upcoming bookings ───────────────────────────
    // Best-effort: errors here don't fail the sync response.
    let remindersCreated = 0
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
              ON CONFLICT (tenant_id, booking_id, template_key, channel, scheduled_for) WHERE booking_id IS NOT NULL
                DO NOTHING
            `
            remindersCreated++
          }
        }
      }
    } catch (reminderErr) {
      console.warn('Reminder scheduling after sync failed (non-fatal):', reminderErr?.message)
    }

    return cors(200, {
      ok: true,
      services: servicesProcessed,
      clients: clientsProcessed,
      bookings: bookingsProcessed,
      orders_created: ordersCreated,
      payments_created: paymentsCreated,
      records_processed: recordsProcessed,
      reminders_scheduled: remindersCreated,
      jobs_cleaned: cleanedCount,
    })
  } catch (e) {
    console.error('sync-booking-provider error:', e)

    if (sql && syncRunId) {
      await sql`
        UPDATE sync_runs
        SET status = 'failed', finished_at = now(), error_message = ${String(e?.message || e)}
        WHERE id = ${syncRunId}
      `.catch(() => {})
    }

    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
