// netlify/functions/pos-sales-stats.mjs
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

    // Get sales stats from Square payments (placeholder for now)
    // TODO: Add actual sales data from pos.pos_payments table when available
    
    const stats = {
      today: 0,
      yesterday: 0,
      thisWeek: 0,
      lastWeek: 0,
      lastUpdate: new Date().toISOString()
    }

    return cors(200, { stats })

  } catch (e) {
    console.error('POS sales stats error:', e)
    return cors(500, { error: 'Failed to load sales stats', details: String(e?.message || e) })
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