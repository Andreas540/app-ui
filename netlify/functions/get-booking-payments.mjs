// netlify/functions/get-booking-payments.mjs
// GET /api/get-booking-payments?status=&date_from=&date_to=&page=1
// Returns booking payment summary — outstanding and collected.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getPayments(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getPayments(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const params = event.queryStringParameters || {}
    const paymentStatus = params.status || null   // unpaid | deposit_paid | paid | all
    const dateFrom = params.date_from || null
    const dateTo   = params.date_to   || null
    const page = Math.max(1, parseInt(params.page || '1', 10))
    const perPage = 50
    const offset = (page - 1) * perPage

    // Summary totals (not paginated)
    const totals = await sql`
      SELECT
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric(12,2)         AS collected,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status IN ('unpaid','deposit_paid')), 0)::numeric(12,2) AS outstanding,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'deposit_paid'), 0)::numeric(12,2) AS deposit_received,
        COUNT(*) FILTER (WHERE payment_status = 'paid')::int                                         AS paid_count,
        COUNT(*) FILTER (WHERE payment_status IN ('unpaid','deposit_paid'))::int                     AS outstanding_count
      FROM bookings
      WHERE tenant_id = ${TENANT_ID}
        AND booking_status NOT IN ('canceled')
        AND (${dateFrom}::date IS NULL OR start_at >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR start_at <  (${dateTo}::date + interval '1 day'))
    `

    // Paginated booking list filtered by payment status
    const rows = await sql`
      SELECT
        b.id, b.start_at,
        b.booking_status, b.payment_status,
        b.total_amount, b.currency,
        c.name AS customer_name,
        s.name AS service_name
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE b.tenant_id = ${TENANT_ID}
        AND b.booking_status NOT IN ('canceled')
        AND (${paymentStatus}::text IS NULL OR ${paymentStatus} = 'all' OR b.payment_status = ${paymentStatus})
        AND (${dateFrom}::date IS NULL OR b.start_at >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR b.start_at <  (${dateTo}::date + interval '1 day'))
      ORDER BY b.start_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `

    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM bookings b
      WHERE b.tenant_id = ${TENANT_ID}
        AND b.booking_status NOT IN ('canceled')
        AND (${paymentStatus}::text IS NULL OR ${paymentStatus} = 'all' OR b.payment_status = ${paymentStatus})
        AND (${dateFrom}::date IS NULL OR b.start_at >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR b.start_at <  (${dateTo}::date + interval '1 day'))
    `

    return cors(200, {
      summary: totals[0],
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
