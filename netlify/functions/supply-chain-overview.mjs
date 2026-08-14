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
      WHERE p.category NOT IN ('service', 'material')
        AND (p.product_kind IS NULL OR p.product_kind = 'standard')
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
        o.order_no,
        o.customer_id,
        c.name as customer,
        o.order_date,
        GREATEST(oi.qty - COALESCE(o.delivered_quantity, 0), 0) as qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.tenant_id = ${TENANT_ID}
        AND oi.qty > COALESCE(o.delivered_quantity, 0)
        AND p.category NOT IN ('service', 'material')
        AND (p.product_kind IS NULL OR p.product_kind = 'standard')
        AND LOWER(p.name) NOT LIKE '%refund%'
        AND LOWER(p.name) NOT LIKE '%discount%'
        AND LOWER(p.name) NOT LIKE '%other product%'
        AND LOWER(p.name) NOT LIKE '%other service%'
      ORDER BY p.name ASC, o.order_date ASC
    `

    // 3. In the warehouse — via product_stock view (same source of truth as Warehouse page)
const warehouse_inventory = await sql`
  WITH committed AS (
    SELECT oi.product_id,
      SUM(GREATEST(oi.qty - oi.delivered_qty, 0)) AS qty,
      json_agg(json_build_object('order_id', o.id, 'order_no', o.order_no, 'qty', GREATEST(oi.qty - oi.delivered_qty, 0)) ORDER BY o.order_no) AS orders
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.tenant_id = ${TENANT_ID}
      AND o.delivered = FALSE
      AND oi.qty > oi.delivered_qty
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
  ),
  on_order AS (
    SELECT ois.product_id,
      SUM(ois.qty - COALESCE(ois.qty_received, 0)) AS qty,
      json_agg(json_build_object('order_id', os.id, 'order_no', os.order_no, 'qty', ois.qty - COALESCE(ois.qty_received, 0)) ORDER BY os.order_no) AS orders
    FROM order_items_suppliers ois
    JOIN orders_suppliers os ON os.id = ois.order_id
    WHERE os.tenant_id = ${TENANT_ID}
      AND ois.qty > COALESCE(ois.qty_received, 0)
      AND ois.product_id IS NOT NULL
    GROUP BY ois.product_id
  )
  SELECT
    p.name AS product,
    ps.pre_prod,
    ps.finished,
    ps.on_hand                          AS qty,
    COALESCE(c.qty, 0)                 AS committed,
    COALESCE(oo.qty, 0)                AS on_order,
    ps.finished - COALESCE(c.qty, 0)  AS available_finished,
    ps.on_hand  - COALESCE(c.qty, 0)  AS available_total,
    c.orders                            AS committed_orders,
    oo.orders                           AS on_order_orders
  FROM products p
  JOIN product_stock ps   ON ps.product_id = p.id AND ps.tenant_id = ${TENANT_ID}
  LEFT JOIN committed c   ON c.product_id  = p.id
  LEFT JOIN on_order oo   ON oo.product_id = p.id
  LEFT JOIN tenant_hidden_products thp ON thp.product_id = p.id AND thp.tenant_id = ${TENANT_ID}
  WHERE p.tenant_id = ${TENANT_ID}
    AND p.category NOT IN ('service', 'material')
    AND (p.product_kind IS NULL OR p.product_kind = 'standard')
    AND LOWER(p.name) NOT LIKE '%refund%'
    AND LOWER(p.name) NOT LIKE '%discount%'
    AND LOWER(p.name) NOT LIKE '%other product%'
    AND LOWER(p.name) NOT LIKE '%other service%'
    AND (ps.ledger_qty <> 0 OR ps.unit_instock_count > 0 OR c.product_id IS NOT NULL OR oo.product_id IS NOT NULL)
    AND (
      thp.product_id IS NULL
      OR ps.on_hand <> 0
      OR COALESCE(c.qty, 0) <> 0
      OR COALESCE(oo.qty, 0) <> 0
    )
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

    // 4. In customs — items with qty_in_customs > 0
    const in_customs = await sql`
      SELECT
        p.name as product,
        SUM(ois.qty_in_customs) as qty
      FROM order_items_suppliers ois
      JOIN orders_suppliers os ON os.id = ois.order_id
      JOIN products p ON p.id = ois.product_id
      WHERE os.tenant_id = ${TENANT_ID}
        AND ois.qty_in_customs > 0
      GROUP BY p.name
      ORDER BY p.name ASC
    `

    // 4b. In transit (shipped but not yet in customs) — items with qty_shipped > 0
    const in_transit = await sql`
      SELECT
        p.name as product,
        SUM(ois.qty_shipped) as qty
      FROM order_items_suppliers ois
      JOIN orders_suppliers os ON os.id = ois.order_id
      JOIN products p ON p.id = ois.product_id
      WHERE os.tenant_id = ${TENANT_ID}
        AND ois.qty_shipped > 0
      GROUP BY p.name
      ORDER BY p.name ASC
    `

    // 5. Ordered from suppliers — pending qty (not shipped, in customs, or received)
    const ordered_from_suppliers = await sql`
      SELECT
        p.name as product,
        os.est_delivery_date,
        SUM(ois.qty - COALESCE(ois.qty_shipped,0) - COALESCE(ois.qty_in_customs,0) - COALESCE(ois.qty_received,0)) as qty
      FROM orders_suppliers os
      JOIN order_items_suppliers ois ON ois.order_id = os.id
      JOIN products p ON p.id = ois.product_id
      WHERE os.tenant_id = ${TENANT_ID}
        AND (ois.qty - COALESCE(ois.qty_shipped,0) - COALESCE(ois.qty_in_customs,0) - COALESCE(ois.qty_received,0)) > 0
      GROUP BY p.name, os.est_delivery_date
      HAVING SUM(ois.qty - COALESCE(ois.qty_shipped,0) - COALESCE(ois.qty_in_customs,0) - COALESCE(ois.qty_received,0)) > 0
      ORDER BY p.name ASC
    `

    return cors(200, {
      recent_deliveries,
      not_delivered,
      not_delivered_orders,
      warehouse_inventory,
      production_data,
      in_customs,
      in_transit,
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