export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET')     return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const product_id  = event.queryStringParameters?.product_id
    const customer_id = event.queryStringParameters?.customer_id
    if (!product_id || !customer_id) return cors(400, { error: 'product_id and customer_id are required' })

    const sql = neon(DATABASE_URL)
    // last order by date (or created_at), grab unit_price
    const rows = await sql/*sql*/`
      SELECT o.unit_price
      FROM orders o
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.product_id = ${product_id}
        AND o.customer_id = ${customer_id}
      ORDER BY o.date DESC NULLS LAST, o.created_at DESC NULLS LAST
      LIMIT 1
    `
    const last = rows[0]?.unit_price ?? null
    return cors(200, { last_unit_price: last })
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
