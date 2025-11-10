// netlify/functions/demand-by-product.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getDemandByProduct(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getDemandByProduct(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' })

    const params = event.queryStringParameters || {}
    
    let fromDate, toDate

    // Check if custom date range is provided
    if (params.from && params.to) {
      fromDate = params.from
      toDate = params.to
    } else {
      // Use days parameter (default 30)
      const days = parseInt(params.days || '30', 10)
      
      if (days <= 0 || days > 365) {
        return cors(400, { error: 'days must be between 1 and 365' })
      }

      // Calculate dates
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - days)
      
      fromDate = from.toISOString().split('T')[0]
      toDate = to.toISOString().split('T')[0]
    }

    const sql = neon(DATABASE_URL)

    // Get demand by product for the specified period
    const demand = await sql`
      SELECT 
        p.name as product,
        SUM(oi.qty) as qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.order_date >= ${fromDate}
        AND o.order_date <= ${toDate}
        AND LOWER(TRIM(p.name)) != 'refund/discount'
      GROUP BY p.name
      ORDER BY SUM(oi.qty) DESC
    `

    return cors(200, demand)
  } catch (e) {
    console.error('getDemandByProduct error:', e)
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