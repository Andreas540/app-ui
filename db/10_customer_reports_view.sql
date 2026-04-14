-- Customer product monthly view — feeds customer ranking and detail reports.
-- Granularity: one row per (tenant, month, customer, product).
-- Revenue      = qty × unit_price
-- COGS         = qty × (product_cost + shipping_cost)  [from order_items]
-- Partner amt  = order-level partner payment distributed proportionally by line revenue
-- Gross Profit = Revenue − COGS − Partner amount
-- Matches the gross_profit formula in revenue_profit_surplus view.

DROP VIEW IF EXISTS public.v_customer_product_monthly;
CREATE VIEW public.v_customer_product_monthly AS
WITH partner_by_order AS (
  -- Total partner payments per order (order_partners is order-level)
  SELECT order_id, SUM(COALESCE(amount, 0)) AS partner_amount
  FROM   public.order_partners
  GROUP BY order_id
),
order_rev AS (
  -- Total revenue per order (needed to compute each line's proportional share)
  SELECT order_id, SUM(qty::numeric * COALESCE(unit_price, 0)) AS order_revenue
  FROM   public.order_items
  GROUP BY order_id
)
SELECT
  o.tenant_id,
  DATE_TRUNC('month', o.order_date)::date                                                AS month,
  c.id                                                                                   AS customer_id,
  c.name                                                                                 AS customer_name,
  c.customer_type,
  p.id                                                                                   AS product_id,
  p.name                                                                                 AS product_name,
  SUM(oi.qty)                                                                            AS qty,
  SUM(oi.qty::numeric * COALESCE(oi.unit_price, 0))                                     AS revenue,
  SUM(oi.qty::numeric * (COALESCE(oi.product_cost, 0) + COALESCE(oi.shipping_cost, 0))) AS cogs,
  -- Partner amount allocated to this product proportionally by line revenue
  SUM(
    CASE WHEN COALESCE(orv.order_revenue, 0) > 0
    THEN COALESCE(po.partner_amount, 0)
           * (oi.qty::numeric * COALESCE(oi.unit_price, 0))
           / orv.order_revenue
    ELSE 0 END
  )                                                                                      AS partner_amount,
  -- gross_profit = revenue − cogs − partner_amount
  SUM(oi.qty::numeric * COALESCE(oi.unit_price, 0))
    - SUM(oi.qty::numeric * (COALESCE(oi.product_cost, 0) + COALESCE(oi.shipping_cost, 0)))
    - SUM(
        CASE WHEN COALESCE(orv.order_revenue, 0) > 0
        THEN COALESCE(po.partner_amount, 0)
               * (oi.qty::numeric * COALESCE(oi.unit_price, 0))
               / orv.order_revenue
        ELSE 0 END
      )                                                                                  AS gross_profit
FROM   public.orders       o
JOIN   public.customers    c   ON c.id        = o.customer_id
JOIN   public.order_items  oi  ON oi.order_id  = o.id
JOIN   public.products     p   ON p.id         = oi.product_id
LEFT JOIN partner_by_order po  ON po.order_id  = o.id
LEFT JOIN order_rev        orv ON orv.order_id = o.id
WHERE  o.order_date IS NOT NULL
  AND  o.notes IS DISTINCT FROM 'Old tab'
GROUP BY
  o.tenant_id,
  DATE_TRUNC('month', o.order_date),
  c.id, c.name, c.customer_type,
  p.id, p.name;
