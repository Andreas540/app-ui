// netlify/functions/pay.mjs
// GET /api/pay?t=TOKEN
// Public — no auth required.
// Returns redirect info for a payment link token:
//   { status: 'redirect', url }  → send customer to checkout
//   { status: 'paid',     order_id } → order already paid
//   { status: 'expired' } → link older than 24 hours
//   { status: 'not_found' }

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const token = (event.queryStringParameters || {}).t
    if (!token) return resp(400, { status: 'not_found' })

    const rows = await sql`
      SELECT token, order_id, tenant_id, checkout_url, created_at
      FROM order_payment_links
      WHERE token = ${token}
      LIMIT 1
    `
    if (!rows.length) return resp(200, { status: 'not_found' })

    const link = rows[0]

    // Expire after 24 hours (matches Stripe's default session lifetime)
    const ageHours = (Date.now() - new Date(link.created_at).getTime()) / 3_600_000
    if (ageHours > 24) return resp(200, { status: 'expired' })

    // Check if order is fully paid
    const paid = await sql`
      SELECT
        COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric AS total,
        COALESCE((SELECT SUM(py.amount) FROM payments py
                  WHERE py.order_id = ${link.order_id}::uuid
                    AND py.tenant_id = ${link.tenant_id}::uuid), 0)::numeric AS paid
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ${link.order_id}::uuid AND o.tenant_id = ${link.tenant_id}::uuid
      LIMIT 1
    `
    if (paid.length && Number(paid[0].paid) >= Number(paid[0].total) && Number(paid[0].total) > 0) {
      return resp(200, { status: 'paid', order_id: link.order_id })
    }

    return resp(200, { status: 'redirect', url: link.checkout_url })
  } catch (e) {
    console.error('pay error:', e)
    return resp(500, { error: String(e?.message || e) })
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
