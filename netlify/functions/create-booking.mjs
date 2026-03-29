// netlify/functions/create-booking.mjs
// POST /api/create-booking
// Creates a manual booking (not from SimplyBook) with linked order + order_item.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return createBooking(event)
  return cors(405, { error: 'Method not allowed' })
}

async function createBooking(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body
    const body = JSON.parse(rawBody || '{}')
    const { service_id, customer_id, date, start_time, total_amount, notes, link_order_id, link_payment_id } = body

    if (!service_id)  return cors(400, { error: 'service_id is required' })
    if (!customer_id) return cors(400, { error: 'customer_id is required' })
    if (!date)        return cors(400, { error: 'date is required' })
    if (!start_time)  return cors(400, { error: 'start_time is required' })

    // Fetch service details (duration, price, currency)
    const svcRows = await sql`
      SELECT id, duration_minutes, price_amount, currency
      FROM services
      WHERE id = ${service_id} AND tenant_id = ${TENANT_ID}
      LIMIT 1
    `
    if (!svcRows.length) return cors(400, { error: 'Service not found' })
    const svc = svcRows[0]
    const durationMin = svc.duration_minutes || 60
    const price = total_amount != null ? Number(total_amount) : Number(svc.price_amount ?? 0)
    const currency = svc.currency || 'USD'

    // Fetch tenant timezone
    const tzRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${TENANT_ID} LIMIT 1`
    const tz = tzRows[0]?.default_timezone || 'UTC'

    // Convert local date+time to UTC
    // We treat date+start_time as being in the tenant's timezone
    const localStr = `${date}T${start_time}:00`
    const startAt = localToUtc(localStr, tz)
    if (!startAt || isNaN(startAt.getTime())) return cors(400, { error: 'Invalid date or start_time' })
    const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000)

    // Determine payment status
    const paymentStatus = price <= 0 ? 'unpaid' : 'unpaid'

    // Insert booking
    const bkRow = await sql`
      INSERT INTO bookings (
        tenant_id, customer_id, service_id,
        booking_status, payment_status,
        start_at, end_at,
        participant_count, total_amount, currency,
        notes
      ) VALUES (
        ${TENANT_ID}, ${customer_id}, ${service_id},
        'confirmed', ${paymentStatus},
        ${startAt.toISOString()}, ${endAt.toISOString()},
        1, ${price}, ${currency},
        ${notes || null}
      )
      RETURNING id
    `
    const bookingId = bkRow[0].id

    let orderId

    if (link_order_id) {
      // Attach booking to an existing order — just link, do NOT add an order_item.
      // The order's value is already defined; the booking is a delivery event, not a revenue event.
      const existing = await sql`
        SELECT id FROM orders
        WHERE id = ${link_order_id} AND tenant_id = ${TENANT_ID} AND customer_id = ${customer_id}
        LIMIT 1
      `
      if (!existing.length) return cors(400, { error: 'Order not found or does not belong to this customer' })
      orderId = link_order_id
    } else {
      // Create a new order with a single line item for this booking
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
        VALUES (${TENANT_ID}, ${customer_id}, ${counterRow[0].last_order_no}, ${date}, FALSE, ${bookingId})
        RETURNING id
      `
      orderId = orderRow[0].id

      // Add order item for the new order only
      await sql`
        INSERT INTO order_items (order_id, service_id, product_id, qty, unit_price)
        VALUES (${orderId}, ${service_id}, ${service_id}, 1, ${price})
      `

      // Handle advance payment allocation
      if (link_payment_id) {
        const advRows = await sql`
          SELECT id, amount FROM payments
          WHERE id = ${link_payment_id} AND tenant_id = ${TENANT_ID} AND customer_id = ${customer_id} AND order_id IS NULL
          LIMIT 1
        `
        if (advRows.length) {
          const advAmount = Number(advRows[0].amount)
          if (advAmount <= price) {
            // Advance covers this booking or less — link entire advance to this order
            await sql`UPDATE payments SET order_id = ${orderId} WHERE id = ${link_payment_id}`
          } else {
            // Advance exceeds booking amount — split:
            // 1. Reduce the advance payment by the booking amount (remainder stays unlinked)
            await sql`UPDATE payments SET amount = ${advAmount - price} WHERE id = ${link_payment_id}`
            // 2. Create a new payment for exactly the booking amount, linked to the new order
            await sql`
              INSERT INTO payments (tenant_id, customer_id, payment_type, amount, payment_date, order_id, notes)
              SELECT tenant_id, customer_id, payment_type, ${price}, payment_date, ${orderId},
                     'Allocated from advance payment'
              FROM payments WHERE id = ${link_payment_id}
            `
          }
        }
      }
    }

    // Link booking → order
    await sql`UPDATE bookings SET order_id = ${orderId} WHERE id = ${bookingId}`

    // Schedule reminders for this booking (best effort, non-fatal)
    try {
      const activeRules = await sql`
        SELECT trigger_event, minutes_offset, channel, template_key, service_id
        FROM reminder_rules
        WHERE tenant_id = ${TENANT_ID} AND active = true
      `
      const nowMs = Date.now()
      for (const rule of activeRules) {
        if (rule.service_id && rule.service_id !== service_id) continue
        let scheduledFor
        if (rule.trigger_event === 'before_start') {
          scheduledFor = new Date(startAt.getTime() + rule.minutes_offset * 60000)
        } else if (rule.trigger_event === 'booking_confirmed') {
          scheduledFor = new Date(Date.now() + rule.minutes_offset * 60000)
        } else if (rule.trigger_event === 'unpaid_balance') {
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
            ${TENANT_ID}, ${bookingId}, ${customer_id},
            ${rule.channel}, ${rule.template_key},
            ${scheduledFor.toISOString()}, 'queued', false, false
          )
          ON CONFLICT (tenant_id, booking_id, template_key, channel, scheduled_for)
            DO NOTHING
        `
      }
    } catch (reminderErr) {
      console.warn('Reminder scheduling failed (non-fatal):', reminderErr?.message)
    }

    return cors(201, { ok: true, booking_id: bookingId, order_id: orderId })
  } catch (e) {
    console.error('create-booking error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// Convert a local datetime string to UTC given an IANA timezone name
function localToUtc(localStr, tz) {
  const cleanStr = localStr.trim().replace(' ', 'T')
  const approxUtc = new Date(cleanStr + 'Z')
  if (isNaN(approxUtc.getTime())) return null
  if (!tz || tz === 'UTC') return approxUtc
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(approxUtc).map(p => [p.type, p.value]))
  const h = parts.hour === '24' ? '00' : parts.hour
  const localAtApprox = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`)
  const offsetMs = localAtApprox.getTime() - approxUtc.getTime()
  return new Date(approxUtc.getTime() - offsetMs)
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
