-- Stage history log for supplier orders.
-- Tracks per-item qty deltas for each stage (shipped / in_customs / received)
-- so the full timeline can be reconstructed and displayed in the stages modal.
--
-- Note: warehouse_deliveries.order_supplier_id already exists in the schema
-- (with FK to orders_suppliers). The PATCH handler will now populate it.

CREATE TABLE IF NOT EXISTS order_supplier_stage_events (
  id                uuid    DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  tenant_id         uuid    NOT NULL,
  supplier_order_id uuid    NOT NULL REFERENCES orders_suppliers(id) ON DELETE CASCADE,
  product_id        uuid    NOT NULL,
  product_name      text    NOT NULL,
  stage             text    NOT NULL,
  qty_delta         numeric(10,2) NOT NULL,
  event_date        date    NOT NULL,
  created_at        timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_supplier_stage_events_stage_check
    CHECK (stage IN ('shipped', 'in_customs', 'received'))
);

CREATE INDEX IF NOT EXISTS idx_osee_supplier_order
  ON order_supplier_stage_events(supplier_order_id);

-- Seed received events from existing data (event date = received_date or fallback)
INSERT INTO order_supplier_stage_events
  (tenant_id, supplier_order_id, product_id, product_name, stage, qty_delta, event_date)
SELECT
  ois.tenant_id,
  ois.order_id,
  ois.product_id,
  p.name,
  'received',
  ois.qty_received,
  COALESCE(os.received_date, os.updated_at::date, CURRENT_DATE)
FROM order_items_suppliers ois
JOIN orders_suppliers os ON os.id = ois.order_id
JOIN products         p  ON p.id  = ois.product_id
WHERE ois.qty_received > 0;

-- Seed in_customs events (event date = in_customs_date or fallback)
INSERT INTO order_supplier_stage_events
  (tenant_id, supplier_order_id, product_id, product_name, stage, qty_delta, event_date)
SELECT
  ois.tenant_id,
  ois.order_id,
  ois.product_id,
  p.name,
  'in_customs',
  ois.qty_in_customs,
  COALESCE(os.in_customs_date, os.updated_at::date, CURRENT_DATE)
FROM order_items_suppliers ois
JOIN orders_suppliers os ON os.id = ois.order_id
JOIN products         p  ON p.id  = ois.product_id
WHERE ois.qty_in_customs > 0;

-- Seed shipped events (event date = delivery_date or fallback)
INSERT INTO order_supplier_stage_events
  (tenant_id, supplier_order_id, product_id, product_name, stage, qty_delta, event_date)
SELECT
  ois.tenant_id,
  ois.order_id,
  ois.product_id,
  p.name,
  'shipped',
  ois.qty_shipped,
  COALESCE(os.delivery_date, os.updated_at::date, CURRENT_DATE)
FROM order_items_suppliers ois
JOIN orders_suppliers os ON os.id = ois.order_id
JOIN products         p  ON p.id  = ois.product_id
WHERE ois.qty_shipped > 0;
