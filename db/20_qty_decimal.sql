-- Allow order item quantities to have up to 2 decimal places.
-- Existing integer values (e.g. 5) become 5.00 — fully backwards compatible.
--
-- Three views reference order_items.qty and must be dropped and recreated.
-- Their definitions are semantically identical to before — all three already
-- cast qty::numeric internally, so the arithmetic result is unchanged.

DROP VIEW IF EXISTS v_customer_product_monthly;
DROP VIEW IF EXISTS revenue_profit_surplus;
DROP VIEW IF EXISTS order_revenue_cogs_by_day;

ALTER TABLE order_items ALTER COLUMN qty TYPE NUMERIC(10,2);

CREATE VIEW order_revenue_cogs_by_day AS
WITH lines AS (
  SELECT o.tenant_id,
    o.order_date AS d,
    ((EXTRACT(year  FROM o.order_date)::integer * 10000) +
     (EXTRACT(month FROM o.order_date)::integer * 100) +
      EXTRACT(day   FROM o.order_date)::integer) AS date_key,
    (oi.qty::numeric * oi.unit_price) AS line_revenue,
    (oi.qty::numeric * (COALESCE(oi.product_cost, 0::numeric) + COALESCE(oi.shipping_cost, 0::numeric))) AS line_cogs
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
)
SELECT tenant_id,
  d AS order_date,
  date_key,
  sum(line_revenue)                    AS revenue_amount,
  sum(line_cogs)                       AS cogs_amount,
  (sum(line_revenue) - sum(line_cogs)) AS profit_amount
FROM lines
GROUP BY tenant_id, d, date_key;

CREATE VIEW revenue_profit_surplus AS
WITH orders_filtered AS (
  SELECT o.tenant_id, o.order_date AS d
  FROM orders o
  WHERE o.order_date IS NOT NULL AND o.notes IS DISTINCT FROM 'Old tab'
),
lines AS (
  SELECT o.tenant_id, o.order_date AS d,
    (oi.qty::numeric * COALESCE(oi.unit_price,    0::numeric)) AS line_revenue,
    (oi.qty::numeric * (COALESCE(oi.product_cost, 0::numeric) + COALESCE(oi.shipping_cost, 0::numeric))) AS line_cogs
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.order_date IS NOT NULL AND o.notes IS DISTINCT FROM 'Old tab'
),
revenue_cogs_by_day AS (
  SELECT tenant_id, d,
    sum(line_revenue) AS revenue_amount,
    sum(line_cogs)    AS cogs_amount
  FROM lines
  GROUP BY tenant_id, d
),
partners_by_day AS (
  SELECT o.tenant_id, o.order_date AS d,
    sum(COALESCE(op.amount, 0::numeric)) AS partner_amount
  FROM orders o
  JOIN order_partners op ON op.order_id = o.id
  WHERE o.order_date IS NOT NULL AND o.notes IS DISTINCT FROM 'Old tab'
  GROUP BY o.tenant_id, o.order_date
),
costs_split_by_day AS (
  SELECT c.tenant_id, c.cost_date AS d,
    sum(c.amount) FILTER (WHERE c.cost_category = 'Business recurring cost')     AS business_recurring,
    sum(c.amount) FILTER (WHERE c.cost_category = 'Business non-recurring cost') AS business_non_recurring,
    sum(c.amount) FILTER (WHERE c.cost_category = 'Private recurring cost')      AS private_recurring,
    sum(c.amount) FILTER (WHERE c.cost_category = 'Private non-recurring cost')  AS private_non_recurring
  FROM costs_all c
  GROUP BY c.tenant_id, c.cost_date
),
all_days AS (
  SELECT tenant_id, d FROM orders_filtered
  UNION
  SELECT tenant_id, d FROM costs_split_by_day
)
SELECT ad.tenant_id,
  ad.d AS order_date,
  ((EXTRACT(year  FROM ad.d)::integer * 10000) +
   (EXTRACT(month FROM ad.d)::integer * 100) +
    EXTRACT(day   FROM ad.d)::integer) AS date_key,
  COALESCE(r.revenue_amount, 0::numeric) AS revenue_amount,
  COALESCE(r.cogs_amount,    0::numeric) AS cogs_amount,
  COALESCE(p.partner_amount, 0::numeric) AS partner_amount,
  (COALESCE(r.revenue_amount, 0::numeric) - COALESCE(r.cogs_amount, 0::numeric)
   - COALESCE(p.partner_amount, 0::numeric)) AS gross_profit,
  COALESCE(cs.business_recurring,     0::numeric) AS business_recurring,
  COALESCE(cs.business_non_recurring, 0::numeric) AS business_non_recurring,
  (COALESCE(r.revenue_amount, 0::numeric) - COALESCE(r.cogs_amount, 0::numeric)
   - COALESCE(p.partner_amount,           0::numeric)
   - COALESCE(cs.business_recurring,      0::numeric)
   - COALESCE(cs.business_non_recurring,  0::numeric)) AS operating_profit,
  COALESCE(cs.private_recurring,     0::numeric) AS private_recurring,
  COALESCE(cs.private_non_recurring, 0::numeric) AS private_non_recurring,
  (COALESCE(r.revenue_amount, 0::numeric) - COALESCE(r.cogs_amount, 0::numeric)
   - COALESCE(p.partner_amount,          0::numeric)
   - COALESCE(cs.business_recurring,     0::numeric)
   - COALESCE(cs.business_non_recurring, 0::numeric)
   - COALESCE(cs.private_recurring,      0::numeric)
   - COALESCE(cs.private_non_recurring,  0::numeric)) AS surplus
FROM all_days ad
LEFT JOIN revenue_cogs_by_day r ON r.tenant_id = ad.tenant_id AND r.d = ad.d
LEFT JOIN partners_by_day     p ON p.tenant_id = ad.tenant_id AND p.d = ad.d
LEFT JOIN costs_split_by_day cs ON cs.tenant_id = ad.tenant_id AND cs.d = ad.d;

CREATE VIEW v_customer_product_monthly AS
WITH partner_by_order AS (
  SELECT order_id,
    sum(COALESCE(amount, 0::numeric)) AS partner_amount
  FROM order_partners
  GROUP BY order_id
),
order_rev AS (
  SELECT order_id,
    sum(qty::numeric * COALESCE(unit_price, 0::numeric)) AS order_revenue
  FROM order_items
  GROUP BY order_id
)
SELECT o.tenant_id,
  date_trunc('month', o.order_date::timestamp with time zone)::date AS month,
  c.id   AS customer_id,
  c.name AS customer_name,
  c.customer_type,
  p.id   AS product_id,
  p.name AS product_name,
  sum(oi.qty) AS qty,
  sum(oi.qty::numeric * COALESCE(oi.unit_price,    0::numeric)) AS revenue,
  sum(oi.qty::numeric * (COALESCE(oi.product_cost, 0::numeric) + COALESCE(oi.shipping_cost, 0::numeric))) AS cogs,
  sum(CASE
    WHEN COALESCE(orv.order_revenue, 0::numeric) > 0
    THEN COALESCE(po.partner_amount, 0::numeric)
       * (oi.qty::numeric * COALESCE(oi.unit_price, 0::numeric))
       / orv.order_revenue
    ELSE 0::numeric
  END) AS partner_amount,
  (sum(oi.qty::numeric * COALESCE(oi.unit_price,    0::numeric))
 - sum(oi.qty::numeric * (COALESCE(oi.product_cost, 0::numeric) + COALESCE(oi.shipping_cost, 0::numeric)))
 - sum(CASE
     WHEN COALESCE(orv.order_revenue, 0::numeric) > 0
     THEN COALESCE(po.partner_amount, 0::numeric)
        * (oi.qty::numeric * COALESCE(oi.unit_price, 0::numeric))
        / orv.order_revenue
     ELSE 0::numeric
   END)) AS gross_profit
FROM orders o
JOIN customers   c   ON c.id = o.customer_id
JOIN order_items oi  ON oi.order_id = o.id
JOIN products    p   ON p.id = oi.product_id
LEFT JOIN partner_by_order po  ON po.order_id  = o.id
LEFT JOIN order_rev        orv ON orv.order_id = o.id
WHERE o.order_date IS NOT NULL AND o.notes IS DISTINCT FROM 'Old tab'
GROUP BY o.tenant_id,
  date_trunc('month', o.order_date::timestamp with time zone),
  c.id, c.name, c.customer_type,
  p.id, p.name;
