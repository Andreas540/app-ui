// netlify/functions/rps.mjs
import { neon } from '@neondatabase/serverless'

export async function handler(event) {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') return ok(204, {})
    if (event.httpMethod !== 'GET')     return err(405, 'Method not allowed')

    const url   = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const path  = url.pathname || ''
    const mStr  = url.searchParams.get('months') || '3'
    const monthsParam = parseInt(mStr, 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(12, monthsParam)) : 3

    // Only handle /api/rps and /api/rps/monthly
    if (!(path.endsWith('/rps') || path.includes('/rps/monthly'))) {
      return err(404, 'Not found')
    }

    const sql = neon(process.env.DATABASE_URL)
    const TENANT_ID = process.env.TENANT_ID || null

    // Two variants: with tenant filter, or without (single-tenant apps)
    const rows = TENANT_ID
      ? await sql/*sql*/`
          with last_n as (
            select month
            from public.revenue_profit_surplus_by_month
            where tenant_id = ${TENANT_ID}
            group by 1
            order by month desc
            limit ${months}
          )
          select
            to_char(v.month, 'YYYY-MM')                           as month,
            v.revenue_amount::float8                              as revenue,
            v.operating_profit::float8                            as operating_profit,
            case when v.revenue_amount <> 0
                 then (v.operating_profit / v.revenue_amount)::float8
                 else 0::float8 end                               as "operatingPct",
            v.surplus::float8                                     as surplus,
            case when v.revenue_amount <> 0
                 then (v.surplus / v.revenue_amount)::float8
                 else 0::float8 end                               as "surplusPct"
          from public.revenue_profit_surplus_by_month v
          join last_n n on n.month = v.month
          where v.tenant_id = ${TENANT_ID}
          order by v.month asc;
        `
      : await sql/*sql*/`
          with last_n as (
            select month
            from public.revenue_profit_surplus_by_month
            group by 1
            order by month desc
            limit ${months}
          )
          select
            to_char(v.month, 'YYYY-MM')                           as month,
            v.revenue_amount::float8                              as revenue,
            v.operating_profit::float8                            as operating_profit,
            case when v.revenue_amount <> 0
                 then (v.operating_profit / v.revenue_amount)::float8
                 else 0::float8 end                               as "operatingPct",
            v.surplus::float8                                     as surplus,
            case when v.revenue_amount <> 0
                 then (v.surplus / v.revenue_amount)::float8
                 else 0::float8 end                               as "surplusPct"
          from public.revenue_profit_surplus_by_month v
          join last_n n on n.month = v.month
          order by v.month asc;
        `

    return ok(200, { rows })
  } catch (e) {
    console.error('rps error:', e)
    return err(500, String(e?.message || e))
  }
}

function ok(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
function err(status, message) { return ok(status, { error: message }) }
