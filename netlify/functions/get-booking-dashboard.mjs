// netlify/functions/get-booking-dashboard.mjs
// GET /api/get-booking-dashboard
// Returns today's schedule, upcoming bookings (next 7 days), monthly revenue
// and outstanding balance count — all from our DB (not the provider).

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getDashboard(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getDashboard(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Use tenant's timezone for "today" so date boundaries match the business's local day
    const tenantRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${TENANT_ID} LIMIT 1`
    const tenantTz = tenantRows[0]?.default_timezone || 'UTC'

    // Today's bookings
    const todayBookings = await sql`
      SELECT
        b.id, b.start_at, b.end_at,
        b.booking_status, b.payment_status,
        b.total_amount, b.currency,
        b.assigned_staff_name, b.participant_count,
        c.name  AS customer_name,
        s.name  AS service_name
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE b.tenant_id = ${TENANT_ID}
        AND b.start_at >= date_trunc('day', now() AT TIME ZONE ${tenantTz})
        AND b.start_at <  date_trunc('day', now() AT TIME ZONE ${tenantTz}) + interval '1 day'
        AND b.booking_status NOT IN ('canceled')
      ORDER BY b.start_at ASC
    `

    // Upcoming bookings — next 7 days (not counting today)
    const upcomingBookings = await sql`
      SELECT
        b.id, b.start_at, b.end_at,
        b.booking_status, b.payment_status,
        b.total_amount, b.currency,
        b.assigned_staff_name,
        c.name  AS customer_name,
        s.name  AS service_name
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE b.tenant_id = ${TENANT_ID}
        AND b.start_at >= date_trunc('day', now() AT TIME ZONE ${tenantTz}) + interval '1 day'
        AND b.start_at <  date_trunc('day', now() AT TIME ZONE ${tenantTz}) + interval '8 days'
        AND b.booking_status NOT IN ('canceled')
      ORDER BY b.start_at ASC
      LIMIT 50
    `

    // Monthly revenue — confirmed + completed bookings this calendar month
    const revenueRows = await sql`
      SELECT
        COALESCE(SUM(total_amount), 0)::numeric(12,2) AS monthly_revenue,
        COUNT(*)::int                                  AS booking_count
      FROM bookings
      WHERE tenant_id = ${TENANT_ID}
        AND booking_status IN ('confirmed', 'completed')
        AND start_at >= date_trunc('month', now() AT TIME ZONE ${tenantTz})
        AND start_at <  date_trunc('month', now() AT TIME ZONE ${tenantTz}) + interval '1 month'
    `

    // Outstanding balances — unpaid or deposit-only
    const outstandingRows = await sql`
      SELECT
        COUNT(*)::int                                      AS outstanding_count,
        COALESCE(SUM(total_amount), 0)::numeric(12,2)     AS outstanding_amount
      FROM bookings
      WHERE tenant_id = ${TENANT_ID}
        AND payment_status IN ('unpaid', 'deposit_paid')
        AND booking_status IN ('pending', 'confirmed')
    `

    return cors(200, {
      today: todayBookings,
      upcoming: upcomingBookings,
      monthly_revenue: Number(revenueRows[0].monthly_revenue),
      monthly_booking_count: revenueRows[0].booking_count,
      outstanding_count: outstandingRows[0].outstanding_count,
      outstanding_amount: Number(outstandingRows[0].outstanding_amount),
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
