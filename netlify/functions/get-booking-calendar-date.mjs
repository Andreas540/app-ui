// netlify/functions/get-booking-calendar-date.mjs
// GET /api/get-booking-calendar-date?date=YYYY-MM-DD
// Returns bookings for a specific date (includes payment_status on each row).

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getDateDetail(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getDateDetail(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const params = event.queryStringParameters || {}
    const date = params.date  // expected: YYYY-MM-DD
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return cors(400, { error: 'date param required (YYYY-MM-DD)' })
    }

    const tenantRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${TENANT_ID} LIMIT 1`
    const tenantTz = tenantRows[0]?.default_timezone || 'UTC'

    // Bookings for the given local date
    const bookings = await sql`
      SELECT
        b.id, b.start_at, b.end_at,
        b.booking_status, b.payment_status,
        b.total_amount, b.currency,
        b.assigned_staff_name,
        c.name AS customer_name,
        s.name AS service_name
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE b.tenant_id = ${TENANT_ID}
        AND b.booking_status NOT IN ('canceled')
        AND (b.start_at AT TIME ZONE ${tenantTz})::date = ${date}::date
      ORDER BY b.start_at ASC
    `

    return cors(200, { bookings, payments: [] })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
