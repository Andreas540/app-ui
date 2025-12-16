// netlify/functions/supplier.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getSupplier(event)
  if (event.httpMethod === 'PUT')    return updateSupplier(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getSupplier(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const id = (event.queryStringParameters?.id || '').trim()
    if (!id) return cors(400, { error: 'id required' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const supp = await sql`
  SELECT id, name, phone, email, address1, address2, city, state, postal_code, country
  FROM suppliers
  WHERE tenant_id = ${TENANT_ID} AND id = ${id}
  LIMIT 1
    `
    if (supp.length === 0) return cors(404, { error: 'Not found' })
    const supplier = supp[0]

    // Calculate owed to supplier: sum of (qty * product_cost + qty * shipping_cost) from order_items_suppliers
    // Payments will be subtracted later when the payments table is created
    const totals = await sql`
      WITH o AS (
        SELECT SUM(ois.qty * ois.product_cost + ois.qty * ois.shipping_cost)::numeric(12,2) AS total_orders
        FROM orders_suppliers os
        JOIN order_items_suppliers ois ON ois.order_id = os.id
        WHERE os.tenant_id = ${TENANT_ID} AND os.supplier_id = ${id}
      )
      SELECT COALESCE(o.total_orders,0) AS total_orders,
             0 AS total_payments,
             COALESCE(o.total_orders,0) AS owed_to_supplier
      FROM o
    `

    // Get orders with their items grouped
    const orders = await sql`
      SELECT
        os.id,
        os.order_no,
        os.order_date,
        os.notes,
        os.delivered,
        os.delivery_date,
        os.received,
        os.received_date,
        os.in_customs,
        os.in_customs_date,
        os.est_delivery_date,
        COALESCE(SUM(ois.qty * ois.product_cost + ois.qty * ois.shipping_cost),0)::numeric(12,2) AS total,
        COUNT(ois.id) AS lines
      FROM orders_suppliers os
      LEFT JOIN order_items_suppliers ois ON ois.order_id = os.id
      WHERE os.tenant_id = ${TENANT_ID}
        AND os.supplier_id = ${id}
      GROUP BY os.id, os.order_no, os.order_date, os.notes, os.delivered, os.delivery_date, os.received, os.received_date, os.in_customs, os.in_customs_date, os.est_delivery_date
      ORDER BY os.order_date DESC, os.order_no DESC
      LIMIT 100
    `

    // Get order items for each order
    const orderIds = orders.map(o => o.id)
    let orderItems = []
    if (orderIds.length > 0) {
      orderItems = await sql`
        SELECT
          ois.order_id,
          p.name AS product_name,
          ois.qty,
          ois.product_cost,
          ois.shipping_cost,
          (ois.qty * ois.product_cost)::numeric(12,2) AS product_total,
          (ois.qty * ois.shipping_cost)::numeric(12,2) AS shipping_total
        FROM order_items_suppliers ois
        JOIN products p ON p.id = ois.product_id
        WHERE ois.order_id = ANY(${orderIds})
        ORDER BY ois.id ASC
      `
    }

    // Group items by order_id
    const itemsByOrder = {}
    for (const item of orderItems) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = []
      }
      itemsByOrder[item.order_id].push(item)
    }

    // Attach items to orders
    const ordersWithItems = orders.map(o => ({
      ...o,
      items: itemsByOrder[o.id] || []
    }))

    // Payments placeholder (empty for now)
    const payments = []

    return cors(200, { supplier, totals: totals[0], orders: ordersWithItems, payments })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function updateSupplier(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const body = JSON.parse(event.body || '{}')
const {
  id, name, phone, email, address1, address2, city, state, postal_code, country
} = body || {}

if (!id)   return cors(400, { error: 'id is required' })
if (!name || typeof name !== 'string') return cors(400, { error: 'name is required' })

const sql = neon(DATABASE_URL)

// Update supplier record
const res = await sql`
  UPDATE suppliers SET
    name = ${name},
    phone = ${phone ?? null},
    email = ${email ?? null},
    address1 = ${address1 ?? null},
    address2 = ${address2 ?? null},
    city = ${city ?? null},
    state = ${state ?? null},
    postal_code = ${postal_code ?? null},
    country = ${country ?? null}
  WHERE tenant_id = ${TENANT_ID} AND id = ${id}
  RETURNING id
    `
    if (res.length === 0) return cors(404, { error: 'Not found' })

    return cors(200, { ok: true })
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
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}