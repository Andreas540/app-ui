// netlify/functions/get-booking-calendar.mjs
// GET /api/get-booking-calendar?month=YYYY-MM
// Returns booking counts per day for the requested month.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getCalendar(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCalendar(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const params = event.queryStringParameters || {}
    const month = params.month  // expected: YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return cors(400, { error: 'month param required (YYYY-MM)' })
    }

    const tenantRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${TENANT_ID} LIMIT 1`
    const tenantTz = tenantRows[0]?.default_timezone || 'UTC'

    const monthStart = `${month}-01`

    // Count non-canceled bookings per local date in the requested month
    const rows = await sql`
      SELECT
        to_char(start_at AT TIME ZONE ${tenantTz}, 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS count
      FROM bookings
      WHERE tenant_id = ${TENANT_ID}
        AND booking_status NOT IN ('canceled')
        AND start_at >= (${monthStart}::date)
        AND start_at <  (${monthStart}::date + interval '1 month')
      GROUP BY day
      ORDER BY day
    `

    const counts = {}
    for (const row of rows) {
      counts[row.day] = row.count
    }

    return cors(200, { counts })
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
