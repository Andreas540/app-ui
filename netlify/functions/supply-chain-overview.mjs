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

    // 3. In the warehouse (split inventory: pre_prod + finished, total = qty)
const warehouse_inventory = await sql`
  WITH wd AS (
    SELECT
      product,
      SUM(CASE WHEN supplier_manual_delivered = 'M' THEN qty ELSE 0 END) AS pre_from_m,
      SUM(CASE WHEN supplier_manual_delivered = 'P' THEN qty ELSE 0 END) AS finished_from_p,
      SUM(CASE WHEN supplier_manual_delivered = 'D' THEN (-1 * qty) ELSE 0 END) AS outbound_qty
    FROM warehouse_deliveries
    WHERE tenant_id = ${TENANT_ID}
    GROUP BY product
  ),
  lp AS (
    SELECT
      p.name AS product,
      SUM(lp.qty_produced) AS produced_qty
    FROM labor_production lp
    JOIN products p ON p.id = lp.product_id
    WHERE lp.tenant_id = ${TENANT_ID}
    GROUP BY p.name
  ),
  received AS (
    SELECT
      p.name AS product,
      SUM(ois.qty) AS received_qty
    FROM orders_suppliers os
    JOIN order_items_suppliers ois ON ois.order_id = os.id
    JOIN products p ON p.id = ois.product_id
    WHERE os.tenant_id = ${TENANT_ID}
      AND os.received = TRUE
    GROUP BY p.name
  ),
  base AS (
    SELECT
      COALESCE(wd.product, lp.product, received.product) AS product,
      COALESCE(wd.pre_from_m, 0) AS pre_from_m,
      COALESCE(wd.finished_from_p, 0) AS finished_from_p,
      COALESCE(wd.outbound_qty, 0) AS outbound_qty,
      COALESCE(lp.produced_qty, 0) AS produced_qty,
      COALESCE(received.received_qty, 0) AS received_qty
    FROM wd
    FULL OUTER JOIN lp ON lp.product = wd.product
    FULL OUTER JOIN received ON received.product = COALESCE(wd.product, lp.product)
  )
  SELECT
    product,
    -- Pre-prod: manual entries + received - production (can go negative)
    (pre_from_m + received_qty - produced_qty) AS pre_prod,
    -- Finished: manual entries + production - deliveries (can go negative)
    (finished_from_p + produced_qty - outbound_qty) AS finished,
    -- Total: all inbound - all outbound
    (pre_from_m + received_qty + finished_from_p - outbound_qty) AS qty
  FROM base
  WHERE product IS NOT NULL
    AND LOWER(product) NOT LIKE '%refund%'
    AND LOWER(product) NOT LIKE '%discount%'
    AND LOWER(product) NOT LIKE '%other product%'
    AND LOWER(product) NOT LIKE '%other service%'
  ORDER BY product ASC
`
    const production_data = await sql`
      SELECT 
        lp.date,
        p.name as product,
        lp.qty_produced as qty
      FROM labor_production lp
      JOIN products p ON p.id = lp.product_id
      WHERE lp.tenant_id = ${TENANT_ID}
        AND lp.date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY lp.date DESC
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
      production_data,
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