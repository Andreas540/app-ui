BEGIN;

-- Find or create tenant BLV, get its id as tid
WITH ins AS (
  INSERT INTO tenants(name)
  SELECT 'BLV'
  WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE name='BLV')
  RETURNING id
),
ten AS (
  SELECT id FROM ins
  UNION ALL
  SELECT id FROM tenants WHERE name='BLV'
  LIMIT 1
)
-- Customers + Partners for BLV (skip if already present)
INSERT INTO customers (tenant_id, name, type)
SELECT (SELECT id FROM ten), v.name, v.type
FROM (VALUES
  ('Roger DC','Customer'),
  ('Carlos Cocoa','Customer'),
  ('Moose WC','Customer'),
  ('Tony','Partner'),
  ('Blanco','Partner')
) AS v(name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM customers c
  WHERE c.tenant_id = (SELECT id FROM ten)
    AND c.name = v.name
);

-- Products for BLV (skip if already present)
WITH ten AS (SELECT id FROM tenants WHERE name='BLV' LIMIT 1)
INSERT INTO products (tenant_id, name, unit_price)
SELECT (SELECT id FROM ten), v.name, v.price
FROM (VALUES
  ('ACE Ultra', 5.25),
  ('Favorites', 5.25),
  ('Boutiq',    5.25),
  ('Popz',      5.25),
  ('Hitz',      4.60)
) AS v(name, price)
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.tenant_id = (SELECT id FROM ten)
    AND p.name = v.name
);

-- Optional: create sample order #1 for BLV if not already there
WITH
  ten AS (SELECT id FROM tenants WHERE name='BLV' LIMIT 1),
  have AS (
    SELECT 1 FROM orders WHERE tenant_id=(SELECT id FROM ten) AND order_no=1
  ),
  c AS (
    SELECT id FROM customers
    WHERE tenant_id=(SELECT id FROM ten) AND name='Roger DC'
    LIMIT 1
  ),
  o AS (
    INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, discount)
    SELECT (SELECT id FROM ten), (SELECT id FROM c), 1, CURRENT_DATE, TRUE, 0
    WHERE NOT EXISTS (SELECT 1 FROM have)
    RETURNING id
  )
INSERT INTO order_items (order_id, product_id, qty, unit_price)
SELECT
  (SELECT id FROM o), p.id,
  CASE p.name WHEN 'ACE Ultra' THEN 2500 ELSE 500 END,
  p.unit_price
FROM products p
WHERE EXISTS (SELECT 1 FROM o)
  AND p.tenant_id=(SELECT id FROM ten)
  AND p.name IN ('ACE Ultra','Favorites');

COMMIT;
