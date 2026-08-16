// netlify/functions/timeline-overview.mjs
// GET /api/timeline-overview?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns customer orders and supplier orders for Gantt/timeline display.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const tenantId = authz.tenantId

    const params = event.queryStringParameters || {}
    const today = new Date().toISOString().slice(0, 10)
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)
    const from = params.from || sixMonthsAgo
    const to   = params.to   || today

    const [customerOrders, supplierOrders] = await Promise.all([
      sql`
        SELECT
          o.id::text,
          o.order_no,
          o.order_date::text,
          o.delivered,
          o.delivered_at::text,
          o.delivered_quantity,
          c.id::text   AS customer_id,
          c.name       AS customer_name,
          STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name) AS product_names,
          SUM(oi.qty * oi.unit_price)::float8 AS amount,
          SUM(oi.qty)::int                    AS total_qty
        FROM orders o
        JOIN customers c        ON c.id = o.customer_id AND c.tenant_id = ${tenantId}::uuid
        JOIN order_items oi     ON oi.order_id = o.id
        JOIN products p         ON p.id = oi.product_id
        WHERE o.tenant_id  = ${tenantId}::uuid
          AND o.order_date >= ${from}::date
          AND o.order_date <= ${to}::date
          AND p.category != 'material'
        GROUP BY o.id, o.order_no, o.order_date, o.delivered, o.delivered_at, o.delivered_quantity, c.id, c.name
        ORDER BY c.name, o.order_date
      `,
      sql`
        SELECT
          os.id::text,
          os.order_no,
          os.order_date::text,
          os.est_delivery_date::text,
          os.delivered,
          os.delivery_date::text,
          os.received,
          os.received_date::text,
          s.id::text   AS supplier_id,
          s.name       AS supplier_name,
          STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name) AS product_names,
          SUM(ois.qty * ois.product_cost)::float8           AS total_cost,
          SUM(ois.qty)::int                                 AS total_qty,
          SUM(COALESCE(ois.qty_received,   0))::int         AS qty_received,
          SUM(COALESCE(ois.qty_shipped,    0))::int         AS qty_shipped,
          SUM(COALESCE(ois.qty_in_customs, 0))::int         AS qty_in_customs
        FROM orders_suppliers os
        JOIN suppliers s               ON s.id = os.supplier_id AND s.tenant_id = ${tenantId}::uuid
        JOIN order_items_suppliers ois ON ois.order_id = os.id AND ois.tenant_id = ${tenantId}::uuid
        JOIN products p                ON p.id = ois.product_id
        WHERE os.tenant_id  = ${tenantId}::uuid
          AND os.order_date >= ${from}::date
          AND os.order_date <= ${to}::date
        GROUP BY os.id, os.order_no, os.order_date, os.est_delivery_date, os.delivered, os.delivery_date, os.received, os.received_date, s.id, s.name
        ORDER BY s.name, os.order_date
      `,
    ])

    // Derive customer order status from qty data
    const custWithStatus = customerOrders.map(o => {
      const dQty = Number(o.delivered_quantity ?? 0)
      const tQty = Number(o.total_qty ?? 0)
      let cust_status
      if (o.delivered || (tQty > 0 && dQty >= tQty)) cust_status = 'delivered'
      else if (dQty > 0)                              cust_status = 'partial'
      else                                            cust_status = 'not_delivered'
      return { ...o, cust_status }
    })

    // Derive supplier order status from item qty aggregates
    const suppWithStatus = supplierOrders.map(o => {
      const tQty  = Number(o.total_qty ?? 0)
      const recv  = Number(o.qty_received ?? 0)
      const ship  = Number(o.qty_shipped ?? 0)
      const cust  = Number(o.qty_in_customs ?? 0)
      let derived_status
      if (o.received || (tQty > 0 && recv >= tQty)) derived_status = 'received'
      else if (recv > 0 && (ship > 0 || cust > 0))  derived_status = 'mixed'
      else if (ship > 0 && cust > 0)                derived_status = 'mixed'
      else if (recv > 0)                             derived_status = 'partial'
      else if (cust > 0)                             derived_status = 'in_customs'
      else if (ship > 0 || o.delivered)              derived_status = 'shipped'
      else                                           derived_status = 'pending'
      return { ...o, derived_status }
    })

    return cors(200, { customer_orders: custWithStatus, supplier_orders: suppWithStatus, from, to })
  } catch (e) {
    console.error('timeline-overview error', e)
    return cors(500, { error: String(e?.message ?? e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
