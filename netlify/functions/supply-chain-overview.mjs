// netlify/functions/supply-chain-overview.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getSupplyChainOverview(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getSupplyChainOverview(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // 1. Recently delivered (last 30 days) - GROUP BY order_id to get net quantities per order
    const recent_deliveries_raw = await sql`
      SELECT 
        MAX(date) as date,
        customer,
        product,
        order_id,
        SUM(qty) as qty
      FROM warehouse_deliveries
      WHERE tenant_id = ${TENANT_ID}
        AND supplier_manual_delivered = 'D'
        AND date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY customer, product, order_id
      HAVING SUM(qty) != 0
      ORDER BY MAX(date) DESC, customer ASC
    `

    // Convert to the expected format with absolute values for display
    const recent_deliveries = recent_deliveries_raw.map(item => ({
      date: item.date,
      customer: item.customer,
      product: item.product,
      qty: Math.abs(Number(item.qty))
    }))

    // 2. Not delivered - UPDATED to support partial deliveries
    // Calculate remaining quantity: (total qty per order) - (delivered quantity)
    const not_delivered = await sql`
      WITH order_remaining AS (
        SELECT 
          o.id,
          oi.product_id,
          oi.qty as item_qty,
          COALESCE(o.delivered_quantity, 0) as delivered_qty,
          GREATEST(oi.qty - COALESCE(o.delivered_quantity, 0), 0) as remaining_qty
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = ${TENANT_ID}
          AND oi.qty > COALESCE(o.delivered_quantity, 0)
      )
      SELECT 
        p.name as product,
        SUM(remaining_qty) as qty
      FROM order_remaining
      JOIN products p ON p.id = order_remaining.product_id
      GROUP BY p.name
      HAVING SUM(remaining_qty) > 0
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}