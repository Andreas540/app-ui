-- Incorporate returns into revenue/profit views.
-- Returns are attributed to return_date (not original order_date) so past months
-- are not retroactively changed — consistent with standard accounting practice.
-- COGS recovery uses order_items.product_cost (same basis the views already use).
-- Partner reversals (return_partner_adjustments) are subtracted from partner_amount.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. order_revenue_cogs_by_day
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.order_revenue_cogs_by_day AS
WITH lines AS (
  SELECT
    o.tenant_id,
    o.order_date AS d,
    SUM((oi.qty)::numeric * oi.unit_price) AS revenue_amount,
    SUM((oi.qty)::numeric * (COALESCE(oi.product_cost, 0) + COALESCE(oi.shipping_cost, 0))) AS cogs_amount
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  GROUP BY o.tenant_id, o.order_date
),
returns_by_day AS (
  SELECT
    o.tenant_id,
    r.return_date AS d,
    COALESCE(SUM(r.settlement_amount), 0)                                             AS return_settlement,
    COALESCE(SUM(ri.qty_returned::numeric * COALESCE(oi.product_cost, 0)), 0)         AS return_cogs_recovered
  FROM public.returns r
  JOIN public.orders o ON o.id = r.order_id
  LEFT JOIN public.return_items ri ON ri.return_id = r.id
  LEFT JOIN public.order_items  oi ON oi.id = ri.order_item_id
  GROUP BY o.tenant_id, r.return_date
),
all_days AS (
  SELECT tenant_id, d FROM lines
  UNION
  SELECT tenant_id, d FROM returns_by_day
)
SELECT
  ad.tenant_id,
  ad.d AS order_date,
  (  EXTRACT(year  FROM ad.d)::int * 10000
   + EXTRACT(month FROM ad.d)::int * 100
   + EXTRACT(day   FROM ad.d)::int
  ) AS date_key,
  COALESCE(l.revenue_amount, 0) - COALESCE(rt.return_settlement,    0) AS revenue_amount,
  COALESCE(l.cogs_amount,    0) - COALESCE(rt.return_cogs_recovered, 0) AS cogs_amount,
  ( COALESCE(l.revenue_amount, 0) - COALESCE(rt.return_settlement,    0) )
  - ( COALESCE(l.cogs_amount,  0) - COALESCE(rt.return_cogs_recovered, 0) ) AS profit_amount
FROM all_days ad
LEFT JOIN lines          l  ON l.tenant_id  = ad.tenant_id AND l.d  = ad.d
LEFT JOIN returns_by_day rt ON rt.tenant_id = ad.tenant_id AND rt.d = ad.d;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. revenue_profit_surplus  (revenue_profit_surplus_by_month inherits for free)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.revenue_profit_surplus AS
WITH orders_filtered AS (
  SELECT o.tenant_id, o.order_date AS d
  FROM public.orders o
  WHERE o.order_date IS NOT NULL
    AND o.notes IS DISTINCT FROM 'Old tab'
),
lines AS (
  SELECT
    o.tenant_id,
    o.order_date AS d,
    (oi.qty::numeric * COALESCE(oi.unit_price, 0))                                              AS line_revenue,
    (oi.qty::numeric * (COALESCE(oi.product_cost, 0) + COALESCE(oi.shipping_cost, 0)))          AS line_cogs
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.order_date IS NOT NULL
    AND o.notes IS DISTINCT FROM 'Old tab'
),
revenue_cogs_by_day AS (
  SELECT tenant_id, d,
    SUM(line_revenue) AS revenue_amount,
    SUM(line_cogs)    AS cogs_amount
  FROM lines
  GROUP BY tenant_id, d
),
partners_by_day AS (
  SELECT o.tenant_id, o.order_date AS d,
    SUM(COALESCE(op.amount, 0)) AS partner_amount
  FROM public.orders o
  JOIN public.order_partners op ON op.order_id = o.id
  WHERE o.order_date IS NOT NULL
    AND o.notes IS DISTINCT FROM 'Old tab'
  GROUP BY o.tenant_id, o.order_date
),
returns_by_day AS (
  SELECT
    o.tenant_id,
    r.return_date AS d,
    COALESCE(SUM(r.settlement_amount), 0)                                             AS return_settlement,
    COALESCE(SUM(ri.qty_returned::numeric * COALESCE(oi.product_cost, 0)), 0)         AS return_cogs_recovered
  FROM public.returns r
  JOIN public.orders o ON o.id = r.order_id
  LEFT JOIN public.return_items ri ON ri.return_id = r.id
  LEFT JOIN public.order_items  oi ON oi.id = ri.order_item_id
  WHERE o.notes IS DISTINCT FROM 'Old tab'
  GROUP BY o.tenant_id, r.return_date
),
partner_reversals_by_day AS (
  SELECT
    o.tenant_id,
    r.return_date AS d,
    COALESCE(SUM(rpa.amount_reversed), 0) AS reversal_amount
  FROM public.return_partner_adjustments rpa
  JOIN public.returns r ON r.id = rpa.return_id
  JOIN public.orders  o ON o.id = r.order_id
  GROUP BY o.tenant_id, r.return_date
),
costs_split_by_day AS (
  SELECT c.tenant_id, c.cost_date AS d,
    SUM(c.amount) FILTER (WHERE c.cost_category = 'Business recurring cost')     AS business_recurring,
    SUM(c.amount) FILTER (WHERE c.cost_category = 'Business non-recurring cost') AS business_non_recurring,
    SUM(c.amount) FILTER (WHERE c.cost_category = 'Private recurring cost')      AS private_recurring,
    SUM(c.amount) FILTER (WHERE c.cost_category = 'Private non-recurring cost')  AS private_non_recurring
  FROM public.costs_all c
  GROUP BY c.tenant_id, c.cost_date
),
all_days AS (
  SELECT tenant_id, d FROM orders_filtered
  UNION
  SELECT tenant_id, d FROM costs_split_by_day
  UNION
  SELECT tenant_id, d FROM returns_by_day
)
SELECT
  ad.tenant_id,
  ad.d AS order_date,
  (  EXTRACT(year  FROM ad.d)::int * 10000
   + EXTRACT(month FROM ad.d)::int * 100
   + EXTRACT(day   FROM ad.d)::int
  ) AS date_key,

  -- Net revenue: order revenue minus return settlements
  COALESCE(r.revenue_amount, 0) - COALESCE(ret.return_settlement,     0) AS revenue_amount,
  -- Net COGS: original COGS minus recovered cost for returned units
  COALESCE(r.cogs_amount,    0) - COALESCE(ret.return_cogs_recovered,  0) AS cogs_amount,
  -- Net partner: original splits minus partner reversals from returns
  COALESCE(p.partner_amount, 0) - COALESCE(pr.reversal_amount,         0) AS partner_amount,

  -- gross_profit = net_revenue - net_cogs - net_partner
  ( COALESCE(r.revenue_amount, 0) - COALESCE(ret.return_settlement,    0) )
  - ( COALESCE(r.cogs_amount,  0) - COALESCE(ret.return_cogs_recovered, 0) )
  - ( COALESCE(p.partner_amount,0) - COALESCE(pr.reversal_amount,       0) ) AS gross_profit,

  COALESCE(cs.business_recurring,     0) AS business_recurring,
  COALESCE(cs.business_non_recurring, 0) AS business_non_recurring,

  -- operating_profit = gross_profit - business costs
  ( COALESCE(r.revenue_amount, 0) - COALESCE(ret.return_settlement,    0) )
  - ( COALESCE(r.cogs_amount,  0) - COALESCE(ret.return_cogs_recovered, 0) )
  - ( COALESCE(p.partner_amount,0) - COALESCE(pr.reversal_amount,       0) )
  - COALESCE(cs.business_recurring,     0)
  - COALESCE(cs.business_non_recurring, 0) AS operating_profit,

  COALESCE(cs.private_recurring,     0) AS private_recurring,
  COALESCE(cs.private_non_recurring, 0) AS private_non_recurring,

  -- surplus = operating_profit - private costs
  ( COALESCE(r.revenue_amount, 0) - COALESCE(ret.return_settlement,    0) )
  - ( COALESCE(r.cogs_amount,  0) - COALESCE(ret.return_cogs_recovered, 0) )
  - ( COALESCE(p.partner_amount,0) - COALESCE(pr.reversal_amount,       0) )
  - COALESCE(cs.business_recurring,     0)
  - COALESCE(cs.business_non_recurring, 0)
  - COALESCE(cs.private_recurring,      0)
  - COALESCE(cs.private_non_recurring,  0) AS surplus

FROM all_days ad
LEFT JOIN revenue_cogs_by_day    r  ON r.tenant_id  = ad.tenant_id AND r.d  = ad.d
LEFT JOIN partners_by_day        p  ON p.tenant_id  = ad.tenant_id AND p.d  = ad.d
LEFT JOIN returns_by_day         ret ON ret.tenant_id = ad.tenant_id AND ret.d = ad.d
LEFT JOIN partner_reversals_by_day pr ON pr.tenant_id = ad.tenant_id AND pr.d = ad.d
LEFT JOIN costs_split_by_day     cs ON cs.tenant_id = ad.tenant_id AND cs.d = ad.d;
