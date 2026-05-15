-- Allow delivered_quantity on orders and qty on warehouse_deliveries to hold
-- up to 2 decimal places, consistent with order_items.qty (NUMERIC(10,2)).
--
-- orders.delivery_status is a generated column that references delivered_quantity,
-- so it must be dropped and recreated around the ALTER TABLE.

ALTER TABLE orders DROP COLUMN delivery_status;
ALTER TABLE orders ALTER COLUMN delivered_quantity TYPE NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN delivery_status text GENERATED ALWAYS AS (
  CASE
    WHEN (delivered = true) THEN 'delivered'
    WHEN (delivered_quantity > 0) THEN 'partial'
    ELSE 'not_delivered'
  END
) STORED;

ALTER TABLE warehouse_deliveries ALTER COLUMN qty TYPE NUMERIC(10,2);
