// netlify/functions/rps.mjs
import { neon } from '@neondatabase/serverless'

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const monthsParam = parseInt(url.searchParams.get('months') || '3', 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(12, monthsParam)) : 3

    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return resp(500, { error: 'TENANT_ID missing' })

    const sql = neon(DATABASE_URL)

    // Get the last N months that have actual revenue (non-zero revenue_amount)
    const rows = await sql/* sql */`
      with mset as (
        select month_start
        from public.revenue_profit_surplus_by_month
        where tenant_id = ${TENANT_ID}
          and revenue_amount is not null
          and revenue_amount != 0
        order by month_start desc
        limit ${months}
      )
      select
        to_char(v.month_start, 'YYYY-MM')           as month,       -- for chart labels
        v.month_start                               as month_start, -- raw date if you ever need it
        coalesce(v.revenue_amount, 0)::float8       as revenue,
        coalesce(v.operating_profit, 0)::float8     as operating_profit,
        coalesce(v.surplus, 0)::float8              as surplus
      from public.revenue_profit_surplus_by_month v
      join mset on mset.month_start = v.month_start
      where v.tenant_id = ${TENANT_ID}
      order by v.month_start asc;
    `

    return resp(200, { rows })
  } catch (err) {
    return resp(500, { error: String(err?.message || err) })
  }
}

function resp(status, body) {
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

