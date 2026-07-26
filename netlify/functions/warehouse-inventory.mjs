// netlify/functions/warehouse-inventory.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getInventory(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getInventory(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Calculate detailed inventory with ATP (Available-to-Promise) columns.
    // Anchor on products so zero-stock products with committed orders still appear.
    const inventory = await sql`
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
      ),
      committed AS (
        SELECT oi.product_id,
          SUM(GREATEST(oi.qty - COALESCE(o.delivered_quantity, 0), 0)) AS qty,
          json_agg(json_build_object('order_id', o.id, 'order_no', o.order_no, 'qty', GREATEST(oi.qty - COALESCE(o.delivered_quantity, 0), 0)) ORDER BY o.order_no) AS orders
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.tenant_id = ${TENANT_ID}
          AND oi.qty > COALESCE(o.delivered_quantity, 0)
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      ),
      on_order AS (
        SELECT ois.product_id,
          SUM(ois.qty) AS qty,
          json_agg(json_build_object('order_id', os.id, 'order_no', os.order_no, 'qty', ois.qty) ORDER BY os.order_no) AS orders
        FROM order_items_suppliers ois
        JOIN orders_suppliers os ON os.id = ois.order_id
        WHERE os.tenant_id = ${TENANT_ID}
          AND os.received = FALSE
          AND ois.product_id IS NOT NULL
        GROUP BY ois.product_id
      )
      SELECT
        p.name AS product,
        p.id AS product_id,
        COALESCE(base.pre_from_m - base.produced_qty, 0)                                                          AS pre_prod,
        COALESCE(base.finished_from_p + base.produced_qty - base.outbound_qty, 0)                                 AS finished,
        COALESCE(base.pre_from_m + base.finished_from_p - base.outbound_qty, 0)                                   AS qty,
        COALESCE(c.qty, 0)                                                                                         AS committed,
        COALESCE(oo.qty, 0)                                                                                        AS on_order,
        COALESCE(base.finished_from_p + base.produced_qty - base.outbound_qty, 0) - COALESCE(c.qty, 0)           AS available_finished,
        COALESCE(base.pre_from_m + base.finished_from_p - base.outbound_qty, 0)   - COALESCE(c.qty, 0)           AS available_total,
        c.orders                                                                                                    AS committed_orders,
        oo.orders                                                                                                   AS on_order_orders
      FROM products p
      LEFT JOIN base    ON base.product_id = p.id
      LEFT JOIN committed c  ON c.product_id  = p.id
      LEFT JOIN on_order oo  ON oo.product_id = p.id
      WHERE p.tenant_id = ${TENANT_ID}
        AND (p.category IS NULL OR p.category != 'service')
        AND (base.product_id IS NOT NULL OR c.product_id IS NOT NULL OR oo.product_id IS NOT NULL)
      ORDER BY p.name ASC
    `

    return cors(200, { inventory })
  } catch (e) {
    console.error('getInventory error:', e)
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