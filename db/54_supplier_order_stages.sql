-- Per-item stage tracking for supplier orders.
-- Adds qty_shipped, qty_in_customs, qty_received columns to order_items_suppliers.
-- Seeds from existing order-level boolean flags so existing data keeps correct status.

-- 1. Add columns
ALTER TABLE order_items_suppliers
  ADD COLUMN IF NOT EXISTS qty_shipped    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_in_customs NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_received   NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Seed qty_received for already-received orders
UPDATE order_items_suppliers ois
SET qty_received = ois.qty
FROM orders_suppliers os
WHERE os.id = ois.order_id
  AND os.received = TRUE
  AND ois.qty_received = 0;

-- 3. Seed qty_in_customs for in-customs (not yet received) orders
UPDATE order_items_suppliers ois
SET qty_in_customs = ois.qty
FROM orders_suppliers os
WHERE os.id = ois.order_id
  AND os.received   = FALSE
  AND os.in_customs = TRUE
  AND ois.qty_in_customs = 0;

-- 4. Seed qty_shipped for shipped-only (delivered but not customs, not received) orders
UPDATE order_items_suppliers ois
SET qty_shipped = ois.qty
FROM orders_suppliers os
WHERE os.id = ois.order_id
  AND os.received   = FALSE
  AND os.in_customs = FALSE
  AND os.delivered  = TRUE
  AND ois.qty_shipped = 0;

-- 5. Seed warehouse_deliveries 'S' records for already-received orders that don't have one yet.
--    This establishes the baseline so the PATCH handler's delete-and-reinsert is idempotent.
INSERT INTO warehouse_deliveries (
  tenant_id, date, supplier_manual_delivered, product, qty, order_id, product_id
)
SELECT
  os.tenant_id,
  COALESCE(os.received_date::date, CURRENT_DATE),
  'S',
  p.name,
  ois.qty,
  ois.order_id,
  ois.product_id
FROM order_items_suppliers ois
JOIN orders_suppliers os ON os.id = ois.order_id
JOIN products         p  ON p.id  = ois.product_id
WHERE os.received = TRUE
  AND ois.qty > 0
  AND NOT EXISTS (
    SELECT 1 FROM warehouse_deliveries wd
    WHERE wd.order_id  = ois.order_id
      AND wd.product_id = ois.product_id
      AND wd.supplier_manual_delivered = 'S'
  );
