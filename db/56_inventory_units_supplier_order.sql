-- Link inventory_units back to the supplier order they were received from.
-- Lets the stages modal count units already registered per order so it only
-- prompts for genuinely unregistered ones. Nullable — manually-added units
-- (via Warehouse page) keep supplier_order_id = NULL and are unaffected.

ALTER TABLE inventory_units
  ADD COLUMN IF NOT EXISTS supplier_order_id uuid
    REFERENCES orders_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_units_supplier_order
  ON inventory_units(supplier_order_id);
