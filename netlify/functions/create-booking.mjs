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
    const { service_id, customer_id, date, start_time, total_amount, notes } = body

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

    // Create linked order
    const counterRow = await sql`
      INSERT INTO tenant_order_counters (tenant_id, last_order_no)
      VALUES (
        ${TENANT_ID},
        (SELECT COALESCE(MAX(order_no), 0) + 1 FROM orders WHERE tenant_id = ${TENANT_ID})
      )
      ON CONFLICT (tenant_id) DO UPDATE
        SET last_order_no = tenant_order_counters.last_order_no + 1
      RETURNING last_order_no
    `
    const orderNo = counterRow[0].last_order_no

    const orderRow = await sql`
      INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, booking_id)
      VALUES (${TENANT_ID}, ${customer_id}, ${orderNo}, ${date}, TRUE, ${bookingId})
      RETURNING id
    `
    const orderId = orderRow[0].id

    // Link booking → order
    await sql`UPDATE bookings SET order_id = ${orderId} WHERE id = ${bookingId}`

    // Create order item
    await sql`
      INSERT INTO order_items (order_id, service_id, product_id, qty, unit_price)
      VALUES (${orderId}, ${service_id}, ${service_id}, 1, ${price})
    `

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
