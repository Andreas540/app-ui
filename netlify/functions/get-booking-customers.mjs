// netlify/functions/get-booking-customers.mjs
// GET /api/get-booking-customers?q=&page=1
// Returns customers who have bookings for this tenant, with booking stats.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getCustomers(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCustomers(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const params = event.queryStringParameters || {}
    const q = (params.q || '').trim()
    const page = Math.max(1, parseInt(params.page || '1', 10))
    const sort = ['name', 'booking_count', 'last_booking'].includes(params.sort) ? params.sort : 'last_booking'
    const perPage = 50
    const offset = (page - 1) * perPage
    const like = q ? `%${q.toLowerCase()}%` : null

    let rows
    if (sort === 'name') {
      rows = await sql`
        SELECT c.id, c.name, c.phone,
          COUNT(b.id)::int AS booking_count,
          MAX(b.start_at)  AS last_booking_at,
          COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status NOT IN ('canceled')), 0)::numeric(12,2) AS total_booked,
          COUNT(b.id) FILTER (WHERE b.payment_status IN ('unpaid','deposit_paid') AND b.booking_status NOT IN ('canceled'))::int AS unpaid_count,
          COALESCE(SUM(b.total_amount) FILTER (WHERE b.payment_status IN ('unpaid','deposit_paid') AND b.booking_status NOT IN ('canceled')), 0)::numeric(12,2) AS unpaid_amount
        FROM customers c
        INNER JOIN bookings b ON b.customer_id = c.id AND b.tenant_id = ${TENANT_ID}
        WHERE c.tenant_id = ${TENANT_ID}
          AND (${like}::text IS NULL OR LOWER(c.name) LIKE ${like})
        GROUP BY c.id, c.name, c.phone
        ORDER BY c.name ASC
        LIMIT ${perPage} OFFSET ${offset}
      `
    } else if (sort === 'booking_count') {
      rows = await sql`
        SELECT c.id, c.name, c.phone,
          COUNT(b.id)::int AS booking_count,
          MAX(b.start_at)  AS last_booking_at,
          COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status NOT IN ('canceled')), 0)::numeric(12,2) AS total_booked,
          COUNT(b.id) FILTER (WHERE b.payment_status IN ('unpaid','deposit_paid') AND b.booking_status NOT IN ('canceled'))::int AS unpaid_count,
          COALESCE(SUM(b.total_amount) FILTER (WHERE b.payment_status IN ('unpaid','deposit_paid') AND b.booking_status NOT IN ('canceled')), 0)::numeric(12,2) AS unpaid_amount
        FROM customers c
        INNER JOIN bookings b ON b.customer_id = c.id AND b.tenant_id = ${TENANT_ID}
        WHERE c.tenant_id = ${TENANT_ID}
          AND (${like}::text IS NULL OR LOWER(c.name) LIKE ${like})
        GROUP BY c.id, c.name, c.phone
        ORDER BY booking_count DESC NULLS LAST
        LIMIT ${perPage} OFFSET ${offset}
      `
    } else {
      rows = await sql`
        SELECT c.id, c.name, c.phone,
          COUNT(b.id)::int AS booking_count,
          MAX(b.start_at)  AS last_booking_at,
          COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status NOT IN ('canceled')), 0)::numeric(12,2) AS total_booked,
          COUNT(b.id) FILTER (WHERE b.payment_status IN ('unpaid','deposit_paid') AND b.booking_status NOT IN ('canceled'))::int AS unpaid_count,
          COALESCE(SUM(b.total_amount) FILTER (WHERE b.payment_status IN ('unpaid','deposit_paid') AND b.booking_status NOT IN ('canceled')), 0)::numeric(12,2) AS unpaid_amount
        FROM customers c
        INNER JOIN bookings b ON b.customer_id = c.id AND b.tenant_id = ${TENANT_ID}
        WHERE c.tenant_id = ${TENANT_ID}
          AND (${like}::text IS NULL OR LOWER(c.name) LIKE ${like})
        GROUP BY c.id, c.name, c.phone
        ORDER BY last_booking_at DESC NULLS LAST
        LIMIT ${perPage} OFFSET ${offset}
      `
    }

    const countRows = await sql`
      SELECT COUNT(DISTINCT c.id)::int AS total
      FROM customers c
      INNER JOIN bookings b ON b.customer_id = c.id AND b.tenant_id = ${TENANT_ID}
      WHERE c.tenant_id = ${TENANT_ID}
        AND (${like}::text IS NULL OR LOWER(c.name) LIKE ${like})
    `

    return cors(200, { customers: rows, total: countRows[0].total, page, per_page: perPage })
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
