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

    // Get sales aggregated by time periods
    // Use America/New_York timezone (EST/EDT)
    // Week starts Sunday (US convention)
    const results = await sql`
      WITH sales_data AS (
        SELECT 
          sale_date_local::date as sale_date,
          SUM(quantity * unit_price_ex_tax) as daily_sales
        FROM pos.vw_sales_with_cost
        WHERE tenant_id = ${authz.tenantId}::uuid
        GROUP BY sale_date_local::date
      ),
      current_dates AS (
        SELECT 
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date as today_est,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York' - INTERVAL '1 day')::date as yesterday_est,
          DATE_TRUNC('week', (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date) as week_start_est
      )
      SELECT
        -- Today (EST)
        COALESCE(SUM(daily_sales) FILTER (
          WHERE sale_date = (SELECT today_est FROM current_dates)
        ), 0) as today,
        
        -- Yesterday (EST)
        COALESCE(SUM(daily_sales) FILTER (
          WHERE sale_date = (SELECT yesterday_est FROM current_dates)
        ), 0) as yesterday,
        
        -- This Week (Sunday to today, EST)
        COALESCE(SUM(daily_sales) FILTER (
          WHERE sale_date >= (SELECT week_start_est FROM current_dates)
            AND sale_date <= (SELECT today_est FROM current_dates)
        ), 0) as this_week,
        
        -- Last Week (previous Sunday to Saturday, EST)
        COALESCE(SUM(daily_sales) FILTER (
          WHERE sale_date >= (SELECT week_start_est - INTERVAL '7 days' FROM current_dates)
            AND sale_date < (SELECT week_start_est FROM current_dates)
        ), 0) as last_week
      FROM sales_data
    `

    const stats = {
      today: Number(results[0]?.today || 0),
      yesterday: Number(results[0]?.yesterday || 0),
      thisWeek: Number(results[0]?.this_week || 0),
      lastWeek: Number(results[0]?.last_week || 0),
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