// netlify/functions/labor-production.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getLaborProduction(event)
  if (event.httpMethod === 'POST') return saveLaborProduction(event)
  if (event.httpMethod === 'DELETE') return deleteLaborProduction(event)
  return cors(405, { error: 'Method not allowed' })
}

/**
 * GET labor production data
 * Query params:
 *   - date: specific date (YYYY-MM-DD)
 *   - from: start date for range query
 *   - to: end date for range query
 */
async function getLaborProduction(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const date = params.get('date')
    const from = params.get('from')
    const to = params.get('to')

    let rows = []

    if (date) {
      // Single date query
      rows = await sql`
        SELECT 
          lp.id,
          lp.date,
          lp.no_of_employees,
          lp.total_hours,
          lp.product_id,
          p.name as product_name,
          lp.qty_produced,
          lp.registered_by,
          lp.notes,
          lp.created_at,
          lp.updated_at
        FROM labor_production lp
        LEFT JOIN products p ON p.id = lp.product_id
        WHERE lp.tenant_id = ${TENANT_ID}
          AND lp.date = ${date}
        ORDER BY p.name
      `
    } else if (from && to) {
      // Date range query
      rows = await sql`
        SELECT 
          lp.id,
          lp.date,
          lp.no_of_employees,
          lp.total_hours,
          lp.product_id,
          p.name as product_name,
          lp.qty_produced,
          lp.registered_by,
          lp.notes,
          lp.created_at,
          lp.updated_at
        FROM labor_production lp
        LEFT JOIN products p ON p.id = lp.product_id
        WHERE lp.tenant_id = ${TENANT_ID}
          AND lp.date >= ${from}
          AND lp.date <= ${to}
        ORDER BY lp.date DESC, p.name
      `
    } else {
      // Get summary of all dates (for calendar color coding)
      rows = await sql`
        SELECT DISTINCT
          date,
          MAX(no_of_employees) as has_employees,
          MAX(total_hours) as has_hours,
          COUNT(DISTINCT product_id) as product_count
        FROM labor_production
        WHERE tenant_id = ${TENANT_ID}
        GROUP BY date
        ORDER BY date DESC
      `
    }

    return cors(200, rows)
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

/**
 * POST: Save labor production data for a date
 * Body: {
 *   date: "2025-01-15",
 *   no_of_employees: 5,
 *   total_hours: 40,
 *   products: [
 *     { product_id: "uuid", qty_produced: 1000 },
 *     { product_id: "uuid", qty_produced: 500 }
 *   ],
 *   notes: "Optional notes"
 * }
 */
async function saveLaborProduction(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    
    // Get actual user name from database
    let userName = 'Unknown'
    if (authz.userId) {
      const userRows = await sql`
        SELECT name FROM users WHERE id = ${authz.userId} LIMIT 1
      `
      if (userRows.length > 0 && userRows[0].name) {
        userName = userRows[0].name
      }
    }

    const body = JSON.parse(event.body || '{}')
    const { date, no_of_employees, total_hours, products, notes } = body

    // Validation
    if (!date) {
      return cors(400, { error: 'date is required' })
    }

    // At least one of: no_of_employees, total_hours, or products must be provided
    if (no_of_employees == null && total_hours == null && (!products || products.length === 0)) {
      return cors(400, { error: 'At least one value must be provided' })
    }

    // Convert to numbers or null
    const numEmployees = no_of_employees != null ? parseInt(no_of_employees, 10) : null
    const numHours = total_hours != null ? Number(total_hours) : null

    // Validate numbers
    if (numEmployees != null && (!Number.isInteger(numEmployees) || numEmployees < 0)) {
      return cors(400, { error: 'no_of_employees must be a non-negative integer' })
    }
    if (numHours != null && (!Number.isFinite(numHours) || numHours < 0)) {
      return cors(400, { error: 'total_hours must be a non-negative number' })
    }

    // Load active BOMs for all submitted products in one query
    const submittedProductIds = (products || []).map(p => p.product_id).filter(Boolean)
    const activeBoms = submittedProductIds.length > 0 ? await sql`
      SELECT pb.id AS bom_id, pb.product_id,
        json_agg(json_build_object('input_product_id', bi.input_product_id, 'qty_per_unit', bi.qty_per_unit)) AS items
      FROM product_boms pb
      JOIN bom_items bi ON bi.bom_id = pb.id
      WHERE pb.tenant_id = ${TENANT_ID}
        AND pb.product_id = ANY(${submittedProductIds})
        AND pb.is_active = TRUE
      GROUP BY pb.id, pb.product_id
    ` : []
    const bomByProduct = Object.fromEntries(activeBoms.map(b => [b.product_id, b]))

    // Strategy: upsert preserving row UUID (stable identity for BOM 'C' row reversal).
    // ON CONFLICT on (tenant_id, date, product_id) updates qty/hours without changing the id.
    // Products removed from the day are deleted explicitly at the end.
    // The null-product case (hours-only day) is handled separately since NULL doesn't
    // participate in conflict detection.

    const upsertedProductIds = [] // track which non-null product_ids were written

    if (products && products.length > 0) {
      for (const prod of products) {
        const { product_id, qty_produced } = prod

        if (!product_id) continue // skip empty product selections

        const qty = qty_produced != null ? Number(qty_produced) : null
        if (qty != null && (!Number.isFinite(qty) || qty < 0)) continue // skip invalid quantities

        const [lpRow] = await sql`
          INSERT INTO labor_production (
            tenant_id, date, no_of_employees, total_hours,
            product_id, qty_produced, registered_by, notes
          )
          VALUES (
            ${TENANT_ID}, ${date}, ${numEmployees}, ${numHours},
            ${product_id}, ${qty}, ${userName}, ${notes || null}
          )
          ON CONFLICT (tenant_id, date, product_id) DO UPDATE SET
            qty_produced    = EXCLUDED.qty_produced,
            no_of_employees = EXCLUDED.no_of_employees,
            total_hours     = EXCLUDED.total_hours,
            notes           = EXCLUDED.notes
          RETURNING id, bom_id
        `
        upsertedProductIds.push(product_id)

        // BOM consumption: reverse previous 'C' rows for this production row,
        // then post fresh ones based on the current qty and active recipe.
        if (qty != null && qty > 0) {
          const bom = bomByProduct[product_id]
          if (bom) {
            // Reverse any existing 'C' rows tied to this production row
            await sql`
              DELETE FROM warehouse_deliveries
              WHERE source_production_id = ${lpRow.id}
                AND supplier_manual_delivered = 'C'
                AND tenant_id = ${TENANT_ID}
            `
            // Post new 'C' rows — one per material in the recipe
            for (const item of bom.items) {
              const consumed = qty * Number(item.qty_per_unit)
              await sql`
                INSERT INTO warehouse_deliveries (
                  tenant_id, date, supplier_manual_delivered, product, customer,
                  qty, product_id, source_production_id
                )
                SELECT
                  ${TENANT_ID},
                  ${date}::date,
                  'C',
                  mp.name,
                  NULL,
                  ${-consumed},
                  ${item.input_product_id},
                  ${lpRow.id}
                FROM products mp
                WHERE mp.id = ${item.input_product_id}
              `
            }
            // Store which bom version was used
            await sql`
              UPDATE labor_production SET bom_id = ${bom.bom_id} WHERE id = ${lpRow.id}
            `
          }
        }
      }

      // Delete product rows no longer in today's entry and any stale null-product row.
      // Also reverse their 'C' consumption rows.
      if (upsertedProductIds.length > 0) {
        const removed = await sql`
          DELETE FROM labor_production
          WHERE tenant_id = ${TENANT_ID}
            AND date = ${date}
            AND (product_id IS NULL OR product_id != ALL(${upsertedProductIds}))
          RETURNING id
        `
        if (removed.length > 0) {
          const removedIds = removed.map(r => r.id)
          await sql`
            DELETE FROM warehouse_deliveries
            WHERE source_production_id = ANY(${removedIds})
              AND supplier_manual_delivered = 'C'
              AND tenant_id = ${TENANT_ID}
          `
        }
      } else {
        // All submitted products were invalid — treat as if no products provided
        const removed = await sql`
          DELETE FROM labor_production WHERE tenant_id = ${TENANT_ID} AND date = ${date} RETURNING id
        `
        if (removed.length > 0) {
          const removedIds = removed.map(r => r.id)
          await sql`
            DELETE FROM warehouse_deliveries
            WHERE source_production_id = ANY(${removedIds})
              AND supplier_manual_delivered = 'C'
              AND tenant_id = ${TENANT_ID}
          `
        }
      }

    } else if (numEmployees != null || numHours != null) {
      // Hours-only day: one null-product row. Try UPDATE first, INSERT if none exists.
      const updated = await sql`
        UPDATE labor_production
        SET no_of_employees = ${numEmployees},
            total_hours     = ${numHours},
            notes           = ${notes || null}
        WHERE tenant_id = ${TENANT_ID}
          AND date      = ${date}
          AND product_id IS NULL
        RETURNING id
      `
      if (updated.length === 0) {
        await sql`
          INSERT INTO labor_production (
            tenant_id, date, no_of_employees, total_hours,
            product_id, qty_produced, registered_by, notes
          )
          VALUES (
            ${TENANT_ID}, ${date}, ${numEmployees}, ${numHours},
            NULL, NULL, ${userName}, ${notes || null}
          )
        `
      }
      // Delete any product rows (switching from product-day to hours-only day)
      await sql`
        DELETE FROM labor_production
        WHERE tenant_id = ${TENANT_ID} AND date = ${date} AND product_id IS NOT NULL
      `
    }

    return cors(200, { ok: true, date })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

/**
 * DELETE: Remove labor production data for a specific date
 * Query params: date (YYYY-MM-DD)
 */
async function deleteLaborProduction(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const date = params.get('date')

    if (!date) {
      return cors(400, { error: 'date parameter is required' })
    }

    const deleted = await sql`
      DELETE FROM labor_production
      WHERE tenant_id = ${TENANT_ID} AND date = ${date}
      RETURNING id
    `
    if (deleted.length > 0) {
      const deletedIds = deleted.map(r => r.id)
      await sql`
        DELETE FROM warehouse_deliveries
        WHERE source_production_id = ANY(${deletedIds})
          AND supplier_manual_delivered = 'C'
          AND tenant_id = ${TENANT_ID}
      `
    }

    return cors(200, { ok: true, deleted: date })
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
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}