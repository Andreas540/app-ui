// netlify/functions/metrics-monthly.mjs
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}`)
    const monthsParam = url.searchParams.get('months') || '3'
    const months = Math.max(1, Math.min(12, Number(monthsParam) || 3))

    const rows = await sql/* sql */`
      with months as (
        select date_trunc('month', (current_date - make_interval(months => gs.i)))::date as month_start
        from generate_series(0, ${months} - 1) as gs(i)
      ),
      order_sums as (
        select
          date_trunc('month', o.order_date)::date as month_start,
          coalesce(sum(oi.qty * oi.unit_price), 0)::numeric as revenue,
          (
            coalesce(sum(oi.qty * oi.unit_price), 0)
            - coalesce(sum(oi.qty * oi.product_cost), 0)
            - coalesce(sum(oi.qty * oi.shipping_cost), 0)
            - coalesce(sum(op.amount), 0)
          )::numeric as profit
        from orders o
        left join order_items   oi on oi.order_id = o.id
        left join order_partners op on op.order_id = o.id
        where
          o.order_date >= (select min(month_start) from months)
          and (o.notes is distinct from 'Old tab')  -- exclude exactly "Old tab"; keep NULL
        group by 1
      )
      select 
        to_char(m.month_start, 'YYYY-MM') as month,
        coalesce(os.revenue, 0)::float8 as revenue,
        coalesce(os.profit, 0)::float8  as profit,
        case when coalesce(os.revenue, 0) = 0 then 0
             else (os.profit / os.revenue)
        end::float8 as profit_pct
      from months m
      left join order_sums os on os.month_start = m.month_start
      order by m.month_start;
    `

    const payload = {
      rows: rows.map(r => ({
        month: r.month,
        revenue: Number(r.revenue) || 0,
        profit:  Number(r.profit)  || 0,
        profitPct: Number(r.profit_pct) || 0,
      })),
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify(payload),
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: e?.message || String(e) }),
    }
  }
}
