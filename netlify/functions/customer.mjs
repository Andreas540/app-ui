// netlify/functions/customer.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getCustomer(event)
  if (event.httpMethod === 'PUT')    return updateCustomer(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCustomer(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const id = (event.queryStringParameters?.id || '').trim()
    if (!id) return cors(400, { error: 'id required' })

    const sql = neon(DATABASE_URL)

    const cust = await sql`
      SELECT id, name, customer_type, shipping_cost, phone,
             address1, address2, city, state, postal_code
      FROM customers
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `
    if (cust.length === 0) return cors(404, { error: 'Not found' })
    const customer = cust[0]

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

async function updateCustomer(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const body = JSON.parse(event.body || '{}')
    const {
      id, name, customer_type, shipping_cost,
      phone, address1, address2, city, state, postal_code
    } = body || {}

    if (!id)   return cors(400, { error: 'id is required' })
    if (!name || typeof name !== 'string') return cors(400, { error: 'name is required' })
    if (customer_type && !['BLV','Partner'].includes(customer_type)) {
      return cors(400, { error: 'invalid customer_type' })
    }
    const sc = (shipping_cost === null || shipping_cost === undefined)
      ? null
      : Number(shipping_cost)
    if (shipping_cost !== undefined && shipping_cost !== null && !Number.isFinite(sc)) {
      return cors(400, { error: 'shipping_cost must be a number or null' })
    }

    const sql = neon(DATABASE_URL)

    const res = await sql`
      UPDATE customers SET
        name = ${name},
        customer_type = ${customer_type ?? null},
        shipping_cost = ${sc},
        phone = ${phone ?? null},
        address1 = ${address1 ?? null},
        address2 = ${address2 ?? null},
        city = ${city ?? null},
        state = ${state ?? null},
        postal_code = ${postal_code ?? null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      RETURNING id
    `
    if (res.length === 0) return cors(404, { error: 'Not found' })

    return cors(200, { ok: true })
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
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}








