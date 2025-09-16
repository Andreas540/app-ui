// netlify/functions/orders.mjs
export async function handler(event) {
  // CORS + preflight
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST')    return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const body = JSON.parse(event.body || '{}')
    const { customer_id, product_id, qty, unit_price, date, delivered = true, discount = 0 } = body

    // basic validation
    if (!customer_id || !product_id || !qty || !unit_price || !date) {
      return cors(400, { error: 'Missing fields: customer_id, product_id, qty, unit_price, date' })
    }
    const qtyInt = parseInt(qty, 10)
    if (!(qtyInt > 0)) return cors(400, { error: 'qty must be > 0' })

    const sql = neon(DATABASE_URL)

    // simple per-tenant order_no (ok for low concurrency)
    const result = await sql.begin(async (tx) => {
      const [{ next_no }] = await tx`
        SELECT COALESCE(MAX(order_no) + 1, 1) AS next_no
        FROM orders
        WHERE tenant_id = ${TENANT_ID}
      `
      const [orderRow] = await tx`
        INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, discount)
        VALUES (${TENANT_ID}, ${customer_id}, ${next_no}, ${date}, ${delivered}, ${discount})
        RETURNING id, order_no
      `
      await tx`
        INSERT INTO order_items (order_id, product_id, qty, unit_price)
        VALUES (${orderRow.id}, ${product_id}, ${qtyInt}, ${unit_price})
      `
      return orderRow
    })

    return cors(200, { ok: true, order_id: result.id, order_no: result.order_no })
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
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
