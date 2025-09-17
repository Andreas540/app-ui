// netlify/functions/customer.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const id = (event.queryStringParameters?.id || '').trim()
    if (!id) return cors(400, { error: 'id required' })

    const sql = neon(DATABASE_URL)

    // 1) Customer
    const cust = await sql`
      SELECT id, name, type, customer_type, shipping_cost, phone,
             address1, address2, city, state, postal_code
      FROM customers
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `
    if (cust.length === 0) return cors(404, { error: 'Not found' })
    const customer = cust[0]

    // 2) Totals
    const totals = await sql`
      WITH o AS (
        SELECT SUM(oi.qty * oi.unit_price)::numeric(12,2) AS total_orders
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = ${id}
      ),
      p AS (
        SELECT SUM(amount)::numeric(12,2) AS total_payments
        FROM payments
        WHERE tenant_id = ${TENANT_ID} AND customer_id = ${id}
      )
      SELECT COALESCE(o.total_orders,0) AS total_orders,
             COALESCE(p.total_payments,0) AS total_payments,
             (COALESCE(o.total_orders,0) - COALESCE(p.total_payments,0)) AS owed_to_me
      FROM o, p
    `

    // 3) Recent orders
    const orders = await sql`
      SELECT o.id, o.order_no, o.order_date, o.delivered,
             COALESCE(SUM(oi.qty * oi.unit_price),0)::numeric(12,2) AS total,
             COUNT(oi.id) AS lines
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = ${id}
      GROUP BY o.id
      ORDER BY o.order_date DESC
      LIMIT 20
    `

    // 4) Recent payments
    const payments = await sql`
      SELECT id, payment_date, payment_type, amount
      FROM payments
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${id}
      ORDER BY payment_date DESC
      LIMIT 20
    `

    return cors(200, { customer, totals: totals[0], orders, payments })
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
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}

