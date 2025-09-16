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

    // Parse JSON body safely
    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return cors(400, { error: 'Invalid JSON body' })
    }

    const { customer_id, product_id, qty, unit_price, date, delivered = true, discount = 0 } = body

    // ---- Explicit validation (no falsy checks) ----
    if (typeof customer_id !== 'string' || customer_id.length === 0)
      return cors(400, { error: 'customer_id required' })
    if (typeof product_id !== 'string' || product_id.length === 0)
      return cors(400, { error: 'product_id required' })

    const qtyInt = Number.parseInt(String(qty), 10)
    if (!Number.isInteger(qtyInt) || qtyInt <= 0)
      return cors(400, { error: 'qty must be an integer > 0' })

    const priceNum = Number(unit_price)
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      return cors(400, { error: 'unit_price must be a number > 0' })

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return cors(400, { error: 'date must be YYYY-MM-DD' })

    const sql = neon(DATABASE_URL)

    // 1) Atomically allocate next order number for this tenant
    const [{ order_no }] = await sql`
      INSERT INTO order_counters (tenant_id, next_no)
      VALUES (${TENANT_ID}, 1)
      ON CONFLICT (tenant_id)
      DO UPDATE SET next_no = order_counters.next_no + 1
      RETURNING next_no AS order_no
    `

    // 2) Insert order header
    const [orderRow] = await sql`
      INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, discount)
      VALUES (${TENANT_ID}, ${customer_id}, ${order_no}, ${date}, ${delivered}, ${discount})
      RETURNING id, order_no
    `

    // 3) Insert order line
    await sql`
      INSERT INTO order_items (order_id, product_id, qty, unit_price)
      VALUES (${orderRow.id}, ${product_id}, ${qtyInt}, ${priceNum})
    `

    return cors(200, { ok: true, order_id: orderRow.id, order_no: orderRow.order_no })
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
