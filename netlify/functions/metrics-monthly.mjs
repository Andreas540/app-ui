// netlify/functions/metrics-monthly.mjs
import { neon } from '@neondatabase/serverless'

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const monthsParam = parseInt(url.searchParams.get('months') || '3', 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(12, monthsParam)) : 3

    const sql = neon(process.env.DATABASE_URL)

    // New logic:
    // - Pick the last N DISTINCT order months present in the data (by orders.order_date),
    //   excluding EXACT 'Old tab' notes.
    // - Then aggregate revenue/profit for those months only.
    const rows = await sql/*sql*/`
      with picked_months as (
        select m
        from (
          select date_trunc('month', o.order_date)::date as m
          from orders o
          where o.order_date is not null
            and (o.notes is distinct from 'Old tab')
          group by 1
          order by 1 desc
          limit ${months}
        ) s
        order by m asc   -- return ascending for nicer chart order
      ),
      included_orders as (
        select o.id, o.order_date
        from orders o
        join picked_months p
          on date_trunc('month', o.order_date)::date = p.m
        where (o.notes is distinct from 'Old tab')
      ),
      monthly_items as (
        select
          to_char(date_trunc('month', o.order_date), 'YYYY-MM') as month,
          sum( (oi.qty::numeric) * (coalesce(oi.unit_price,0)::numeric) ) as revenue,
          sum( (oi.qty::numeric) * (coalesce(oi.unit_price,0)::numeric)
              - (oi.qty::numeric) * (coalesce(oi.product_cost,0)::numeric)
              - (oi.qty::numeric) * (coalesce(oi.shipping_cost,0)::numeric) ) as profit_before_partners
        from included_orders o
        join order_items oi on oi.order_id = o.id
        group by 1
      ),
      monthly_partners as (
        select
          to_char(date_trunc('month', o.order_date), 'YYYY-MM') as month,
          sum(coalesce(op.amount,0)) as partner_amount
        from included_orders o
        join order_partners op on op.order_id = o.id
        group by 1
      )
      select
        mi.month,
        coalesce(mi.revenue, 0)::float8                                                as revenue,
        (coalesce(mi.profit_before_partners,0) - coalesce(mp.partner_amount,0))::float8 as profit,
        case
          when coalesce(mi.revenue,0) > 0
            then (coalesce(mi.profit_before_partners,0) - coalesce(mp.partner_amount,0)) / mi.revenue
          else 0
        end::float8 as "profitPct"
      from monthly_items mi
      left join monthly_partners mp using (month)
      order by mi.month;
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


