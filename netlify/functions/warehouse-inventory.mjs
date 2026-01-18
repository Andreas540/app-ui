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

    // Calculate detailed inventory - GROUP BY product_id and JOIN with products for current name
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
      )
      SELECT
        p.name AS product,
        base.product_id,
        (base.pre_from_m - base.produced_qty) AS pre_prod,
        (base.finished_from_p + base.produced_qty - base.outbound_qty) AS finished,
        (base.pre_from_m + base.finished_from_p - base.outbound_qty) AS qty
      FROM base
      JOIN products p ON p.id = base.product_id
      WHERE p.tenant_id = ${TENANT_ID}
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