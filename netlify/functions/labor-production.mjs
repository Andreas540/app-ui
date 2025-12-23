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
    const userName = authz.userName || 'Unknown'

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

    // Strategy: Delete existing records for this date, then insert new ones
    // This handles updates cleanly
    await sql`
      DELETE FROM labor_production
      WHERE tenant_id = ${TENANT_ID} AND date = ${date}
    `

    // Insert new records
    if (products && products.length > 0) {
      for (const prod of products) {
        const { product_id, qty_produced } = prod
        
        if (!product_id) continue // Skip empty product selections
        
        const qty = qty_produced != null ? parseInt(qty_produced, 10) : null
        if (qty != null && (!Number.isInteger(qty) || qty < 0)) continue // Skip invalid quantities

        await sql`
          INSERT INTO labor_production (
            tenant_id, date, no_of_employees, total_hours,
            product_id, qty_produced, registered_by, notes
          )
          VALUES (
            ${TENANT_ID},
            ${date},
            ${numEmployees},
            ${numHours},
            ${product_id},
            ${qty},
            ${userName},
            ${notes || null}
          )
        `
      }
    } else if (numEmployees != null || numHours != null) {
      // No products, but has employee/hours data - insert one record with null product
      await sql`
        INSERT INTO labor_production (
          tenant_id, date, no_of_employees, total_hours,
          product_id, qty_produced, registered_by, notes
        )
        VALUES (
          ${TENANT_ID},
          ${date},
          ${numEmployees},
          ${numHours},
          NULL,
          NULL,
          ${userName},
          ${notes || null}
        )
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

    await sql`
      DELETE FROM labor_production
      WHERE tenant_id = ${TENANT_ID} AND date = ${date}
    `

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