// netlify/functions/customers.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })
    const sql = neon(DATABASE_URL)

    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters?.q?.trim() ?? ''
      const like = `%${q}%`
      const rows = await sql`
        WITH o AS (
          SELECT o.customer_id, SUM(oi.qty * oi.unit_price)::numeric(12,2) AS total_orders
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID}
          GROUP BY o.customer_id
        ),
        p AS (
          SELECT customer_id, SUM(amount)::numeric(12,2) AS total_payments
          FROM payments
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY customer_id
        )
        SELECT c.id, c.name, c.type, c.customer_type, c.shipping_cost, c.phone,
               c.address1, c.address2, c.city, c.state, c.postal_code,
               COALESCE(o.total_orders, 0) AS total_orders,
               COALESCE(p.total_payments, 0) AS total_payments,
               (COALESCE(o.total_orders,0) - COALESCE(p.total_payments,0)) AS owed_to_me
        FROM customers c
        LEFT JOIN o ON o.customer_id = c.id
        LEFT JOIN p ON p.customer_id = c.id
        WHERE c.tenant_id = ${TENANT_ID}
        ${q ? sql`AND c.name ILIKE ${like}` : sql``}
        ORDER BY c.name
      `
      return cors(200, { customers: rows })
    }

    if (event.httpMethod === 'POST') {
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON body' }) }

      const {
        name,
        customer_type,     // 'BLV' | 'Partner'
        shipping_cost,
        phone,
        address1, address2, city, state, postal_code
      } = body

      if (typeof name !== 'string' || !name.trim()) return cors(400, { error: 'name required' })
      if (customer_type !== 'BLV' && customer_type !== 'Partner')
        return cors(400, { error: "customer_type must be 'BLV' or 'Partner'" })

      const ship = Number(shipping_cost ?? 0)
      if (!Number.isFinite(ship) || ship < 0) return cors(400, { error: 'shipping_cost must be >= 0' })

      // Back-compat: map to old 'type' used elsewhere (Partners group under Partner)
      const legacyType = customer_type === 'Partner' ? 'Partner' : 'Customer'

      const [row] = await sql`
        INSERT INTO customers (
          id, tenant_id, name, type, customer_type, shipping_cost, phone,
          address1, address2, city, state, postal_code
        )
        VALUES (gen_random_uuid(), ${TENANT_ID}, ${name.trim()}, ${legacyType}, ${customer_type}, ${ship}, ${phone || null},
                ${address1 || null}, ${address2 || null}, ${city || null}, ${state || null}, ${postal_code || null})
        RETURNING id
      `
      return cors(200, { ok: true, id: row.id })
    }

    return cors(405, { error: 'Method not allowed' })
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
