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

    // Calculate inventory matching Supply Chain Overview logic
    const inventory = await sql`
      WITH wd AS (
        SELECT
          product,
          product_id,
          SUM(qty) AS warehouse_qty
        FROM warehouse_deliveries
        WHERE tenant_id = ${TENANT_ID}
        GROUP BY product, product_id
      ),
      received AS (
        SELECT
          p.id AS product_id,
          p.name AS product,
          SUM(ois.qty) AS received_qty
        FROM orders_suppliers os
        JOIN order_items_suppliers ois ON ois.order_id = os.id
        JOIN products p ON p.id = ois.product_id
        WHERE os.tenant_id = ${TENANT_ID}
          AND os.received = TRUE
        GROUP BY p.id, p.name
      )
      SELECT
        COALESCE(wd.product, received.product) AS product,
        COALESCE(wd.product_id, received.product_id) AS product_id,
        COALESCE(wd.warehouse_qty, 0) + COALESCE(received.received_qty, 0) AS qty
      FROM wd
      FULL OUTER JOIN received ON received.product_id = wd.product_id
      ORDER BY product ASC
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