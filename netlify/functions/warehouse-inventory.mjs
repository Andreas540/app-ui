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

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // ── Sellable products — via product_stock view ─────────────────────────
    // on_hand is resolved centrally for all unit_tracking modes:
    //   'none'              → ledger_qty (existing M/S/P/D logic)
    //   'serialized_intake' → ledger_qty − count(Sold units)
    //   'on_promote'        → ledger_qty ('D' row still posted; Sold units are metadata)
    const inventory = await sql`
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
        p.name               AS product,
        p.id                 AS product_id,
        ps.has_bom,
        ps.unit_tracking,
        ps.unit_instock_count,
        ps.pre_prod,
        ps.finished,
        ps.on_hand           AS qty,
        COALESCE(c.qty, 0)  AS committed,
        COALESCE(oo.qty, 0) AS on_order,
        ps.finished - COALESCE(c.qty, 0) AS available_finished,
        ps.on_hand  - COALESCE(c.qty, 0) AS available_total,
        c.orders             AS committed_orders,
        oo.orders            AS on_order_orders
      FROM products p
      JOIN product_stock ps   ON ps.product_id = p.id AND ps.tenant_id = ${TENANT_ID}
      LEFT JOIN committed c   ON c.product_id  = p.id
      LEFT JOIN on_order oo   ON oo.product_id = p.id
      LEFT JOIN tenant_hidden_products thp ON thp.product_id = p.id AND thp.tenant_id = ${TENANT_ID}
      WHERE p.tenant_id = ${TENANT_ID}
        AND p.category NOT IN ('service', 'material')
        AND (p.product_kind IS NULL OR p.product_kind = 'standard')
        AND (ps.ledger_qty <> 0 OR ps.unit_instock_count > 0 OR c.product_id IS NOT NULL OR oo.product_id IS NOT NULL)
        AND (
          thp.product_id IS NULL
          OR ps.on_hand <> 0
          OR COALESCE(c.qty, 0) <> 0
          OR COALESCE(oo.qty, 0) <> 0
        )
      ORDER BY p.name ASC
    `

    // ── Materials ───────────────────────────────────────────────────────────
    // Stock = received (M+S) + consumed ('C', already stored negative).
    // on_order = supplier orders not yet received.
    // used_in = list of products/services that reference this material in their active recipe.
    const materials = await sql`
      WITH mat_wd AS (
        SELECT product_id,
          SUM(CASE WHEN supplier_manual_delivered IN ('M', 'S') THEN qty ELSE 0 END) AS received,
          SUM(CASE WHEN supplier_manual_delivered = 'C'         THEN qty ELSE 0 END) AS consumed
        FROM warehouse_deliveries
        WHERE tenant_id = ${TENANT_ID}
        GROUP BY product_id
      ),
      mat_on_order AS (
        SELECT ois.product_id, SUM(ois.qty) AS qty
        FROM order_items_suppliers ois
        JOIN orders_suppliers os ON os.id = ois.order_id
        WHERE os.tenant_id = ${TENANT_ID} AND os.received = FALSE
        GROUP BY ois.product_id
      ),
      mat_used_in AS (
        SELECT bi.input_product_id,
          json_agg(DISTINCT p.name ORDER BY p.name) AS used_in_products
        FROM bom_items bi
        JOIN product_boms pb ON pb.id = bi.bom_id AND pb.is_active = TRUE AND pb.tenant_id = ${TENANT_ID}
        JOIN products p ON p.id = pb.product_id
        GROUP BY bi.input_product_id
      )
      SELECT
        p.name       AS product,
        p.id         AS product_id,
        COALESCE(mat_wd.received, 0) + COALESCE(mat_wd.consumed, 0) AS on_hand,
        COALESCE(mat_wd.received, 0)                                  AS received,
        COALESCE(mat_wd.consumed, 0)                                  AS consumed,
        COALESCE(mat_on_order.qty, 0)                                 AS on_order,
        COALESCE(mui.used_in_products, '[]'::json)                    AS used_in
      FROM products p
      LEFT JOIN mat_wd       ON mat_wd.product_id       = p.id
      LEFT JOIN mat_on_order ON mat_on_order.product_id = p.id
      LEFT JOIN mat_used_in mui ON mui.input_product_id = p.id
      LEFT JOIN tenant_hidden_products thp ON thp.product_id = p.id AND thp.tenant_id = ${TENANT_ID}
      WHERE p.tenant_id = ${TENANT_ID}
        AND p.category = 'material'
        AND (
          thp.product_id IS NULL
          OR COALESCE(mat_wd.received, 0) + COALESCE(mat_wd.consumed, 0) <> 0
          OR COALESCE(mat_on_order.qty, 0) <> 0
        )
      ORDER BY p.name ASC
    `

    // Undelivered order items with a unit_identifier set — these appear as named pending units.
    // Gracefully falls back to empty if migration 49 hasn't run yet.
    let namedItems = []
    try {
      namedItems = await sql`
        SELECT oi.id, oi.product_id, oi.unit_identifier,
               o.order_no, o.order_date::text AS order_date,
               c.name AS customer_name
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN customers c ON c.id = o.customer_id
        WHERE o.tenant_id = ${TENANT_ID}
          AND o.delivered = FALSE
          AND oi.unit_identifier IS NOT NULL
        ORDER BY o.order_date DESC, o.order_no DESC
      `
    } catch { /* column not yet migrated */ }

    return cors(200, { inventory, materials, named_items: namedItems })
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
