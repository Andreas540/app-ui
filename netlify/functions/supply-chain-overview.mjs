// netlify/functions/supply-chain-overview.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getSupplyChainOverview(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getSupplyChainOverview(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' })

    const sql = neon(DATABASE_URL)

    // 1. Recently delivered (last 30 days)
    const recent_deliveries = await sql`
      SELECT 
        date,
        customer,
        product,
        qty
      FROM warehouse_deliveries
      WHERE tenant_id = ${TENANT_ID}
        AND supplier_manual_delivered = 'D'
        AND date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY date DESC, customer ASC
    `

    // 2. Not delivered
    const not_delivered = await sql`
      SELECT 
        p.name as product,
        SUM(oi.qty) as qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.delivered = FALSE
      GROUP BY p.name
      ORDER BY p.name ASC
    `

    // 3. In the warehouse (aggregated inventory)
    const warehouse_inventory = await sql`
      SELECT 
        product,
        SUM(qty) as qty
      FROM warehouse_deliveries
      WHERE tenant_id = ${TENANT_ID}
      GROUP BY product
      ORDER BY product ASC
    `

    // 4. In customs
    const in_customs = await sql`
      SELECT 
        p.name as product,
        SUM(ois.qty) as qty
      FROM orders_suppliers os
      JOIN order_items_suppliers ois ON ois.order_id = os.id
      JOIN products p ON p.id = ois.product_id
      WHERE os.tenant_id = ${TENANT_ID}
        AND os.in_customs = TRUE
      GROUP BY p.name
      ORDER BY p.name ASC
    `

    // 5. Ordered from suppliers (delivered OR (not delivered, not in customs, not received))
    const ordered_from_suppliers = await sql`
      SELECT 
        p.name as product,
        os.est_delivery_date,
        os.delivery_date,
        os.delivered,
        SUM(ois.qty) as qty
      FROM orders_suppliers os
      JOIN order_items_suppliers ois ON ois.order_id = os.id
      JOIN products p ON p.id = ois.product_id
      WHERE os.tenant_id = ${TENANT_ID}
        AND (
          os.delivered = TRUE
          OR (os.delivered = FALSE AND os.in_customs = FALSE AND os.received = FALSE)
        )
      GROUP BY p.name, os.est_delivery_date, os.delivery_date, os.delivered
      ORDER BY p.name ASC
    `

    return cors(200, {
      recent_deliveries,
      not_delivered,
      warehouse_inventory,
      in_customs,
      ordered_from_suppliers,
    })
  } catch (e) {
    console.error('getSupplyChainOverview error:', e)
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