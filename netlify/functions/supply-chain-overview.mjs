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

    // Ensure delivered_at column exists (safe to run repeatedly)
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at DATE`

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // 1. Recently delivered (last 30 days) - GROUP BY order_id to get net quantities per order
    const recent_deliveries_raw = await sql`
      SELECT
        COALESCE(o.delivered_at, MAX(wd.date)) as date,
        wd.customer,
        wd.product,
        wd.order_id,
        SUM(wd.qty) as qty
      FROM warehouse_deliveries wd
      LEFT JOIN orders o ON o.id = wd.order_id AND o.tenant_id = ${TENANT_ID}
      WHERE wd.tenant_id = ${TENANT_ID}
        AND wd.supplier_manual_delivered = 'D'
        AND wd.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY wd.customer, wd.product, wd.order_id, o.delivered_at
      HAVING SUM(wd.qty) != 0
      ORDER BY COALESCE(o.delivered_at, MAX(wd.date)) DESC, wd.customer ASC
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
      WHERE (p.category IS NULL OR p.category != 'service')
        AND LOWER(p.name) NOT LIKE '%refund%'
        AND LOWER(p.name) NOT LIKE '%discount%'
        AND LOWER(p.name) NOT LIKE '%other product%'
        AND LOWER(p.name) NOT LIKE '%other service%'
      GROUP BY p.name
      HAVING SUM(remaining_qty) > 0
      ORDER BY p.name ASC
    `

    // 2b. Not delivered — order-level breakdown (same filter, no aggregation)
    const not_delivered_orders = await sql`
      SELECT
        p.name as product,
        o.id as order_id,
        c.name as customer,
        o.date as order_date,
        GREATEST(oi.qty - COALESCE(o.delivered_quantity, 0), 0) as qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.tenant_id = ${TENANT_ID}
        AND oi.qty > COALESCE(o.delivered_quantity, 0)
        AND (p.category IS NULL OR p.category != 'service')
        AND LOWER(p.name) NOT LIKE '%refund%'
        AND LOWER(p.name) NOT LIKE '%discount%'
        AND LOWER(p.name) NOT LIKE '%other product%'
        AND LOWER(p.name) NOT LIKE '%other service%'
      ORDER BY p.name ASC, o.date ASC
    `

    // 3. In the warehouse (split inventory: pre_prod + finished, total = qty)
const warehouse_inventory = await sql`
  WITH wd AS (
    SELECT
      product_id,
      SUM(CASE WHEN supplier_manual_delivered IN ('M', 'S') THEN qty ELSE 0 END) AS pre_from_m,
      SUM(CASE WHEN supplier_manual_delivered = 'P' THEN qty ELSE 0 END) AS finished_from_p,
      SUM(CASE WHEN supplier_manual_delivered = 'D' THEN (-1 * qty) ELSE 0 END) AS outbound_qty
    FROM warehouse_deliveries
    WHERE tenant_id = ${TENANT_ID}
    GROUP BY product_id
  ),
  lp AS (
    SELECT
      product_id,
      SUM(qty_produced) AS produced_qty
    FROM labor_production
    WHERE tenant_id = ${TENANT_ID}
    GROUP BY product_id
  ),
  base AS (
    SELECT
      COALESCE(wd.product_id, lp.product_id) AS product_id,
      COALESCE(wd.pre_from_m, 0) AS pre_from_m,
      COALESCE(wd.finished_from_p, 0) AS finished_from_p,
      COALESCE(wd.outbound_qty, 0) AS outbound_qty,
      COALESCE(lp.produced_qty, 0) AS produced_qty
    FROM wd
    FULL OUTER JOIN lp ON lp.product_id = wd.product_id
  )
  SELECT
    p.name AS product,
    (base.pre_from_m - base.produced_qty) AS pre_prod,
    (base.finished_from_p + base.produced_qty - base.outbound_qty) AS finished,
    (base.pre_from_m + base.finished_from_p - base.outbound_qty) AS qty
  FROM base
  JOIN products p ON p.id = base.product_id
  WHERE p.tenant_id = ${TENANT_ID}
    AND (p.category IS NULL OR p.category != 'service')
    AND LOWER(p.name) NOT LIKE '%refund%'
    AND LOWER(p.name) NOT LIKE '%discount%'
    AND LOWER(p.name) NOT LIKE '%other product%'
    AND LOWER(p.name) NOT LIKE '%other service%'
  ORDER BY p.name ASC
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

    // 4. In customs — exclude orders that have since been received
    const in_customs = await sql`
      SELECT
        p.name as product,
        SUM(ois.qty) as qty
      FROM orders_suppliers os
      JOIN order_items_suppliers ois ON ois.order_id = os.id
      JOIN products p ON p.id = ois.product_id
      WHERE os.tenant_id = ${TENANT_ID}
        AND os.in_customs = TRUE
        AND os.received = FALSE
      GROUP BY p.name
      ORDER BY p.name ASC
    `

    // 5. Ordered from suppliers — only orders not yet in customs and not received.
    //    Shipped (delivered=TRUE) orders remain here until they reach customs.
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
        AND os.in_customs = FALSE
        AND os.received = FALSE
      GROUP BY p.name, os.est_delivery_date, os.delivery_date, os.delivered
      ORDER BY p.name ASC
    `

    return cors(200, {
      recent_deliveries,
      not_delivered,
      not_delivered_orders,
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