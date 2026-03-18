// netlify/functions/get-booking-detail.mjs
// GET /api/get-booking-detail?id=<booking_uuid>
// Returns a single booking with customer, service and payment obligation details.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getDetail(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getDetail(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const id = event.queryStringParameters?.id
    if (!id) return cors(400, { error: 'id is required' })

    const rows = await sql`
      SELECT
        b.id, b.start_at, b.end_at, b.timezone,
        b.booking_status, b.payment_status,
        b.total_amount, b.currency,
        b.assigned_staff_name, b.participant_count,
        b.location_name, b.notes,
        b.external_booking_id, b.external_provider, b.external_status,
        b.created_at, b.updated_at,
        c.id    AS customer_id,
        c.name  AS customer_name,
        c.phone AS customer_phone,
        s.id    AS service_id,
        s.name  AS service_name,
        s.service_type,
        s.duration_minutes
      FROM bookings b
      LEFT JOIN customers c ON c.id = b.customer_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE b.id = ${id} AND b.tenant_id = ${TENANT_ID}
      LIMIT 1
    `

    if (!rows.length) return cors(404, { error: 'Booking not found' })

    // Payment obligations for this booking
    const obligations = await sql`
      SELECT id, obligation_type, due_amount, currency, due_at, obligation_status
      FROM payment_obligations
      WHERE booking_id = ${id} AND tenant_id = ${TENANT_ID}
      ORDER BY created_at ASC
    `

    return cors(200, { booking: rows[0], obligations })
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
