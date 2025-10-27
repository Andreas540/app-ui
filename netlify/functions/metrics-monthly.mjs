// netlify/functions/metrics-monthly.mjs
import { neon } from '@neondatabase/serverless'

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const monthsParam = parseInt(url.searchParams.get('months') || '3', 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(12, monthsParam)) : 3

    const sql = neon(process.env.DATABASE_URL)

    // Logic:
    // - Consider all orders in the last N calendar months (by orders.order_date)
    // - Exclude orders where notes = 'Old tab' (exact match)
    // - Revenue = sum over order_items of qty * unit_price (only)
    // - Profit = Revenue - (qty*product_cost) - (qty*shipping_cost) - partner amounts
    //   NOTE: partner amounts are aggregated separately and joined at the month level,
    //   so they never inflate revenue.
    const rows = await sql/*sql*/`
      with bounds as (
        select
          date_trunc('month', (current_date - ((${months} - 1) || ' months')::interval)) as start_month,
          date_trunc('month', current_date) + interval '1 month' as end_month
      ),
      -- orders to include (exclude EXACT 'Old tab')
      included_orders as (
        select o.id, o.order_date
        from orders o
        cross join bounds b
        where o.order_date >= b.start_month
          and o.order_date <  b.end_month
          and (o.notes is distinct from 'Old tab')
      ),
      -- Revenue & item costs per month from order_items only
      monthly_items as (
        select
          to_char(o.order_date, 'YYYY-MM') as month,
          sum( (oi.qty::numeric) * (coalesce(oi.unit_price,0)::numeric) )                                  as revenue,
          sum( (oi.qty::numeric) * (coalesce(oi.unit_price,0)::numeric)
              - (oi.qty::numeric) * (coalesce(oi.product_cost,0)::numeric)
              - (oi.qty::numeric) * (coalesce(oi.shipping_cost,0)::numeric) )                              as profit_before_partners
        from included_orders o
        join order_items oi on oi.order_id = o.id
        group by 1
      ),
      -- Partner amounts per month (kept separate to avoid multiplying item rows)
      monthly_partners as (
        select
          to_char(o.order_date, 'YYYY-MM') as month,
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
        end::float8 as profitPct
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

