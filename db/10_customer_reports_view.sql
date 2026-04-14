-- Customer product monthly view — feeds customer ranking and detail reports.
-- Granularity: one row per (tenant, month, customer, product).
-- Revenue   = qty × unit_price
-- COGS      = qty × (product_cost + shipping_cost)  [from order_items, same as rps view]
-- Gross Profit = Revenue − COGS
-- Note: partner payments are order-level business costs, not customer-specific,
--       so they are excluded here (consistent with gross_profit definition).

CREATE OR REPLACE VIEW public.v_customer_product_monthly AS
SELECT
  o.tenant_id,
  DATE_TRUNC('month', o.order_date)::date                                                       AS month,
  c.id                                                                                           AS customer_id,
  c.name                                                                                         AS customer_name,
  c.customer_type,
  p.id                                                                                           AS product_id,
  p.name                                                                                         AS product_name,
  SUM(oi.qty::numeric * COALESCE(oi.unit_price, 0))                                             AS revenue,
  SUM(oi.qty::numeric * (COALESCE(oi.product_cost, 0) + COALESCE(oi.shipping_cost, 0)))         AS cogs,
  SUM(oi.qty::numeric * COALESCE(oi.unit_price, 0))
    - SUM(oi.qty::numeric * (COALESCE(oi.product_cost, 0) + COALESCE(oi.shipping_cost, 0)))     AS gross_profit
FROM   public.orders       o
JOIN   public.customers    c  ON c.id  = o.customer_id
JOIN   public.order_items  oi ON oi.order_id = o.id
JOIN   public.products     p  ON p.id  = oi.product_id
WHERE  o.order_date IS NOT NULL
  AND  o.notes IS DISTINCT FROM 'Old tab'
GROUP BY
  o.tenant_id,
  DATE_TRUNC('month', o.order_date),
  c.id, c.name, c.customer_type,
  p.id, p.name;
