// netlify/functions/metrics-rps-monthly.mjs
import { neon } from '@neondatabase/serverless'

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const monthsParam = parseInt(url.searchParams.get('months') || '3', 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(12, monthsParam)) : 3

    const sql = neon(process.env.DATABASE_URL)

    // Pick last N distinct months present in revenue_profit_surplus_by_month
    // (If you run multi-tenant, add WHERE tenant_id = $TENANT_ID to both CTEs.)
    const rows = await sql/*sql*/`
      with picked_months as (
        select m
        from (
          select month_start::date as m
          from public.revenue_profit_surplus_by_month
          group by 1
          order by 1 desc
          limit ${months}
        ) s
        order by m asc
      )
      select
        to_char(p.m, 'YYYY-MM') as month,
        coalesce(sum(r.revenue_amount),0)::float8      as revenue_amount,
        coalesce(sum(r.operating_profit),0)::float8    as operating_profit,
        coalesce(sum(r.surplus),0)::float8             as surplus
      from picked_months p
      left join public.revenue_profit_surplus_by_month r
        on r.month_start::date = p.m
      group by p.m
      order by p.m;
    `

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=0, s-maxage=60'
      },
      body: JSON.stringify({ rows })
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err?.message || err) }) }
  }
}
