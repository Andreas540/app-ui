// netlify/functions/get-bookings.mjs
// GET /api/get-bookings?status=&date_from=&date_to=&page=1
// Returns paginated, filtered bookings list.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getBookings(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getBookings(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const params = event.queryStringParameters || {}
    const status = params.status || null
    const dateFrom = params.date_from || null
    const dateTo = params.date_to || null
    const page = Math.max(1, parseInt(params.page || '1', 10))
    const perPage = 50
    const offset = (page - 1) * perPage

    const rows = await sql`
      SELECT
        b.id, b.start_at, b.end_at,
        b.booking_status, b.payment_status,
        b.total_amount, b.currency,
        b.assigned_staff_name, b.participant_count,
        b.external_booking_id,
        c.name  AS customer_name,
        s.name  AS service_name
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE b.tenant_id = ${TENANT_ID}
        AND (${status}::text IS NULL OR b.booking_status = ${status})
        AND (${dateFrom}::date IS NULL OR b.start_at >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL   OR b.start_at <  (${dateTo}::date + interval '1 day'))
      ORDER BY b.start_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `

    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM bookings b
      WHERE b.tenant_id = ${TENANT_ID}
        AND (${status}::text IS NULL OR b.booking_status = ${status})
        AND (${dateFrom}::date IS NULL OR b.start_at >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL   OR b.start_at <  (${dateTo}::date + interval '1 day'))
    `

    return cors(200, {
      bookings: rows,
      total: countRows[0].total,
      page,
      per_page: perPage,
    })
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
