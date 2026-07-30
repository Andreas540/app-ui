-- Item-Level Inventory — Layer 1: Units Foundation
-- Adds: unit_tracking on products, inventory_units table, unit_id on order_items,
--       product_stock view (central helper), updated delivery trigger.

-- ── 1. unit_tracking on products ────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_tracking TEXT NOT NULL DEFAULT 'none';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_unit_tracking_check;
ALTER TABLE products
  ADD CONSTRAINT products_unit_tracking_check
  CHECK (unit_tracking IN ('none', 'on_promote', 'serialized_intake'));

-- ── 2. inventory_units table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_units (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      UUID        NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  product_id     UUID        NOT NULL REFERENCES products(id)    ON DELETE RESTRICT,
  serial_number  TEXT,
  condition      TEXT,
  listing_status TEXT        NOT NULL DEFAULT 'Inventory'
                 CHECK (listing_status IN ('Inventory', 'Listed', 'Sold')),
  order_item_id  UUID        REFERENCES order_items(id)          ON DELETE RESTRICT,
  acquired_at    TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product-scoped serial uniqueness; same serial may exist on different products.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_serial_uniq
  ON inventory_units (tenant_id, product_id, serial_number)
  WHERE serial_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_units_tenant_product
  ON inventory_units (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_units_status
  ON inventory_units (product_id, listing_status);
CREATE INDEX IF NOT EXISTS idx_inventory_units_order_item
  ON inventory_units (order_item_id)
  WHERE order_item_id IS NOT NULL;

CREATE TRIGGER trg_inventory_units_updated_at
  BEFORE UPDATE ON inventory_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_units_tenant_isolation ON inventory_units
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- ── 3. unit_id on order_items ─────────────────────────────────────────────────
-- Nullable FK: when set, this order line is reserved for a specific named unit.
-- ON DELETE SET NULL: deleting an inventory_units row clears the reservation.
-- (The FK on inventory_units.order_item_id has ON DELETE RESTRICT — together
--  they prevent accidental dangling references in both directions.)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_id BIGINT REFERENCES inventory_units(id) ON DELETE SET NULL;

-- ── 4. product_stock view (the central stock-resolution helper) ───────────────
-- on_hand formula:
--   • 'none' products:           ledger_qty  (existing M/S/P/D logic, unchanged)
--   • 'serialized_intake':       ledger_qty − count(Sold units)
--                                (no 'D' row is posted on serialized delivery;
--                                 unit status change IS the stock decrement)
--   • 'on_promote' products:     ledger_qty  ('D' row still posted on delivery;
--                                 Sold unit rows are identity/warranty records only)
-- Callers JOIN this view on (tenant_id, product_id) and read on_hand, unit_instock_count,
-- unit_tracking instead of computing on-hand inline.

CREATE OR REPLACE VIEW product_stock AS
WITH wd AS (
  SELECT
    product_id,
    SUM(CASE WHEN supplier_manual_delivered IN ('M','S') THEN  qty ELSE 0 END) AS pre_from_m,
    SUM(CASE WHEN supplier_manual_delivered = 'P'        THEN  qty ELSE 0 END) AS finished_from_p,
    SUM(CASE WHEN supplier_manual_delivered = 'D'        THEN -qty ELSE 0 END) AS outbound_qty
  FROM warehouse_deliveries
  GROUP BY product_id
),
lp AS (
  SELECT product_id, SUM(qty_produced) AS produced_qty
  FROM labor_production
  GROUP BY product_id
),
bom_active AS (
  SELECT DISTINCT product_id
  FROM product_boms
  WHERE is_active = TRUE
),
-- Only serialized_intake Sold units are subtracted from on_hand (no backing 'D' row).
u_sold_si AS (
  SELECT iu.product_id, COUNT(*)::int AS sold_count
  FROM inventory_units iu
  JOIN products px ON px.id = iu.product_id AND px.unit_tracking = 'serialized_intake'
  WHERE iu.listing_status = 'Sold'
  GROUP BY iu.product_id
),
u_instock AS (
  SELECT product_id, COUNT(*)::int AS instock_count
  FROM inventory_units
  WHERE listing_status IN ('Inventory', 'Listed')
  GROUP BY product_id
)
SELECT
  p.id         AS product_id,
  p.tenant_id,
  p.unit_tracking,
  (ba.product_id IS NOT NULL) AS has_bom,
  -- Per-bucket breakdown (matches existing warehouse-inventory CTE — for display)
  CASE WHEN ba.product_id IS NOT NULL
    THEN COALESCE(wd.pre_from_m, 0)
    ELSE COALESCE(wd.pre_from_m, 0) - COALESCE(lp.produced_qty, 0)
  END AS pre_prod,
  COALESCE(wd.finished_from_p, 0) + COALESCE(lp.produced_qty, 0)
    - COALESCE(wd.outbound_qty, 0) AS finished,
  -- Raw ledger total (anonymous pool base, before unit adjustment)
  CASE WHEN ba.product_id IS NOT NULL
    THEN COALESCE(wd.pre_from_m,0) + COALESCE(wd.finished_from_p,0)
       + COALESCE(lp.produced_qty,0) - COALESCE(wd.outbound_qty,0)
    ELSE COALESCE(wd.pre_from_m,0) + COALESCE(wd.finished_from_p,0)
       - COALESCE(wd.outbound_qty,0)
  END AS ledger_qty,
  COALESCE(u_sold_si.sold_count,  0) AS sold_unit_count,
  COALESCE(u_instock.instock_count, 0) AS unit_instock_count,
  -- on_hand: subtract sold units only for serialized_intake (they have no 'D' row)
  CASE WHEN ba.product_id IS NOT NULL
    THEN COALESCE(wd.pre_from_m,0) + COALESCE(wd.finished_from_p,0)
       + COALESCE(lp.produced_qty,0) - COALESCE(wd.outbound_qty,0)
    ELSE COALESCE(wd.pre_from_m,0) + COALESCE(wd.finished_from_p,0)
       - COALESCE(wd.outbound_qty,0)
  END - COALESCE(u_sold_si.sold_count, 0) AS on_hand
FROM products p
LEFT JOIN wd         ON wd.product_id      = p.id
LEFT JOIN lp         ON lp.product_id      = p.id
LEFT JOIN bom_active ba ON ba.product_id   = p.id
LEFT JOIN u_sold_si  ON u_sold_si.product_id  = p.id
LEFT JOIN u_instock  ON u_instock.product_id  = p.id;

-- ── 5. Updated delivery trigger — branches on unit_tracking ──────────────────
-- 'none' + 'on_promote': existing 'D' row behavior (unchanged).
-- 'serialized_intake':   flip the claimed unit (order_items.unit_id) to Sold;
--                        no 'D' row — the unit status is the stock decrement.
-- BOM service 'C' rows: unchanged (migration 41 logic preserved below).

CREATE OR REPLACE FUNCTION public.handle_order_item_delivered_qty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit_tracking TEXT;
  v_category      TEXT;
  v_bom_id        BIGINT;
  v_bom_item      RECORD;
  v_tenant_id     UUID;
  v_timezone      TEXT;
  v_order_date    DATE;
BEGIN
  IF (OLD.delivered_qty IS DISTINCT FROM NEW.delivered_qty) THEN

    -- Determine how this product tracks stock
    SELECT p.unit_tracking, p.category
      INTO v_unit_tracking, v_category
      FROM products p WHERE p.id = NEW.product_id LIMIT 1;

    -- ── 'D' row management ───────────────────────────────────────────────────
    -- Always remove the old 'D' row for this line (if any).
    DELETE FROM warehouse_deliveries
      WHERE order_id   = NEW.order_id
        AND product_id = NEW.product_id
        AND supplier_manual_delivered = 'D';

    IF v_unit_tracking = 'serialized_intake' THEN
      -- No 'D' row. Unit status is the stock change.
      IF NEW.unit_id IS NOT NULL THEN
        IF NEW.delivered_qty > 0 THEN
          UPDATE inventory_units
            SET listing_status = 'Sold', updated_at = now()
            WHERE id = NEW.unit_id AND listing_status != 'Sold';
        ELSE
          -- Reversal: unit returns to Listed (still claimed on the order)
          UPDATE inventory_units
            SET listing_status = 'Listed', updated_at = now()
            WHERE id = NEW.unit_id AND listing_status = 'Sold';
        END IF;
      END IF;

    ELSE
      -- 'none' and 'on_promote': standard 'D' row (on_promote Sold unit is optional
      -- metadata created by application code and does not affect on_hand).
      IF NEW.delivered_qty > 0 THEN
        INSERT INTO warehouse_deliveries (
          tenant_id, date, supplier_manual_delivered, product, customer,
          qty, order_id, product_id
        )
        SELECT
          o.tenant_id,
          (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(t.default_timezone, 'UTC'))::date,
          'D', p.name, c.name,
          -NEW.delivered_qty,
          NEW.order_id, NEW.product_id
        FROM orders   o
        JOIN tenants   t ON t.id = o.tenant_id
        JOIN products  p ON p.id = NEW.product_id
        JOIN customers c ON c.id = o.customer_id
        WHERE o.id = NEW.order_id;
      END IF;
    END IF;

    -- ── BOM service 'C' rows (unchanged from migration 41) ───────────────────
    IF v_category = 'service' THEN
      SELECT pb.id INTO v_bom_id
        FROM orders o
        JOIN product_boms pb ON pb.product_id = NEW.product_id
                             AND pb.tenant_id  = o.tenant_id
                             AND pb.is_active  = TRUE
        WHERE o.id = NEW.order_id LIMIT 1;

      IF v_bom_id IS NOT NULL THEN
        SELECT o.tenant_id, o.order_date, t.default_timezone
          INTO v_tenant_id, v_order_date, v_timezone
          FROM orders o JOIN tenants t ON t.id = o.tenant_id
          WHERE o.id = NEW.order_id LIMIT 1;

        DELETE FROM warehouse_deliveries
          WHERE source_order_item_id = NEW.id
            AND supplier_manual_delivered = 'C'
            AND tenant_id = v_tenant_id;

        IF NEW.delivered_qty > 0 THEN
          FOR v_bom_item IN
            SELECT bi.input_product_id, bi.qty_per_unit, mp.name AS material_name
              FROM bom_items bi
              JOIN products mp ON mp.id = bi.input_product_id
              WHERE bi.bom_id = v_bom_id
          LOOP
            INSERT INTO warehouse_deliveries (
              tenant_id, date, supplier_manual_delivered, product, customer,
              qty, product_id, source_order_item_id
            )
            VALUES (
              v_tenant_id,
              (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date,
              'C', v_bom_item.material_name, NULL,
              -(NEW.delivered_qty * v_bom_item.qty_per_unit),
              v_bom_item.input_product_id,
              NEW.id
            );
          END LOOP;
        END IF;
      END IF;
    END IF;

  END IF;
  RETURN NEW;
END;
$$;
