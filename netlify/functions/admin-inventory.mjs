// netlify/functions/admin-inventory.mjs
// POST { action: 'clearInventory', productIds: 'all' | string[] }
// Admin-only. Inserts compensating warehouse_deliveries records to zero out inventory.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    if (!['tenant_admin', 'super_admin'].includes(authz.role)) {
      return cors(403, { error: 'Admin access required' })
    }
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { action, productIds } = body

    if (action !== 'clearInventory') return cors(400, { error: 'Invalid action' })
    if (!productIds) return cors(400, { error: 'productIds required' })

    // Compute current inventory for the tenant
    const inventory = await sql`
      WITH wd AS (
        SELECT
          product_id,
          SUM(CASE WHEN supplier_manual_delivered IN ('M','S') THEN qty ELSE 0 END) AS pre_from_m,
          SUM(CASE WHEN supplier_manual_delivered = 'P' THEN qty ELSE 0 END)        AS finished_from_p,
          SUM(CASE WHEN supplier_manual_delivered = 'D' THEN (-1 * qty) ELSE 0 END) AS outbound_qty
        FROM warehouse_deliveries
        WHERE tenant_id = ${TENANT_ID}
        GROUP BY product_id
      ),
      lp AS (
        SELECT product_id, SUM(qty_produced) AS produced_qty
        FROM labor_production
        WHERE tenant_id = ${TENANT_ID}
        GROUP BY product_id
      ),
      base AS (
        SELECT
          COALESCE(wd.product_id, lp.product_id) AS product_id,
          COALESCE(wd.pre_from_m,     0) AS pre_from_m,
          COALESCE(wd.finished_from_p,0) AS finished_from_p,
          COALESCE(wd.outbound_qty,   0) AS outbound_qty,
          COALESCE(lp.produced_qty,   0) AS produced_qty
        FROM wd
        FULL OUTER JOIN lp ON lp.product_id = wd.product_id
      )
      SELECT
        base.product_id,
        p.name AS product,
        (base.pre_from_m - base.produced_qty)                              AS pre_prod,
        (base.finished_from_p + base.produced_qty - base.outbound_qty)    AS finished
      FROM base
      JOIN products p ON p.id = base.product_id
      WHERE p.tenant_id = ${TENANT_ID}
        AND (p.category IS NULL OR p.category != 'service')
    `

    // Filter to requested products
    const targets = productIds === 'all'
      ? inventory
      : inventory.filter(r => productIds.includes(r.product_id))

    if (targets.length === 0) return cors(200, { ok: true, cleared: 0 })

    const today = new Date().toISOString().slice(0, 10)
    let cleared = 0

    for (const row of targets) {
      const preProd  = Number(row.pre_prod)
      const finished = Number(row.finished)

      // Insert compensating M entry to zero pre-prod
      if (preProd !== 0) {
        await sql`
          INSERT INTO warehouse_deliveries
            (tenant_id, date, supplier_manual_delivered, product, qty, product_id)
          VALUES
            (${TENANT_ID}::uuid, ${today}::date, 'M', ${row.product}, ${-preProd}, ${row.product_id}::uuid)
        `
      }

      // Insert compensating P entry to zero finished
      if (finished !== 0) {
        await sql`
          INSERT INTO warehouse_deliveries
            (tenant_id, date, supplier_manual_delivered, product, qty, product_id)
          VALUES
            (${TENANT_ID}::uuid, ${today}::date, 'P', ${row.product}, ${-finished}, ${row.product_id}::uuid)
        `
      }

      if (preProd !== 0 || finished !== 0) cleared++
    }

    return cors(200, { ok: true, cleared })
  } catch (e) {
    console.error('admin-inventory error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
