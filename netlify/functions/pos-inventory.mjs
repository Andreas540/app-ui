// netlify/functions/pos-inventory.mjs
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  try {
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    // Get location filter from query params
    const url = new URL(event.rawUrl)
    const locationId = url.searchParams.get('location')

    // Build query with optional location filter
    let query
    if (locationId) {
      query = sql`
        SELECT 
          item_name,
          item_variation,
          location_id,
          location_name,
          quantity,
          days_of_inventory_remaining
        FROM pos.vw_inventory
        WHERE tenant_id = ${authz.tenantId}::uuid
          AND location_id = ${locationId}
        ORDER BY item_name ASC
      `
    } else {
      query = sql`
        SELECT 
          item_name,
          item_variation,
          location_id,
          location_name,
          quantity,
          days_of_inventory_remaining
        FROM pos.vw_inventory
        WHERE tenant_id = ${authz.tenantId}::uuid
        ORDER BY item_name ASC
      `
    }

    const inventory = await query

    // Get unique locations for filter dropdown
    const locations = await sql`
      SELECT DISTINCT location_id, location_name
      FROM pos.vw_inventory
      WHERE tenant_id = ${authz.tenantId}::uuid
        AND location_name IS NOT NULL
      ORDER BY location_name ASC
    `

    return cors(200, { inventory, locations })

  } catch (e) {
    console.error('POS inventory error:', e)
    return cors(500, { error: 'Failed to load inventory', details: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Active-Tenant',
    },
    body: JSON.stringify(body),
  }
}