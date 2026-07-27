-- Bill of Materials v1 schema
-- All changes are additive/widening — no existing data is affected.

-- ── 1. products: allow 'material' category ────────────────────────────────────
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_category_check;

ALTER TABLE products
  ADD CONSTRAINT products_category_check
    CHECK (category = ANY (ARRAY['product'::text, 'service'::text, 'material'::text]));

-- ── 2. warehouse_deliveries: allow 'C' (consumed) movement type ───────────────
-- Three existing constraints all need updating.

ALTER TABLE warehouse_deliveries
  DROP CONSTRAINT IF EXISTS warehouse_deliveries_check,
  DROP CONSTRAINT IF EXISTS warehouse_deliveries_supplier_manual_delivered_check,
  DROP CONSTRAINT IF EXISTS warehouse_deliveries_check1;

-- Re-add with 'C' included
ALTER TABLE warehouse_deliveries
  ADD CONSTRAINT warehouse_deliveries_check
    CHECK (supplier_manual_delivered = ANY (ARRAY['M'::bpchar, 'S'::bpchar, 'D'::bpchar, 'P'::bpchar, 'C'::bpchar])),
  ADD CONSTRAINT warehouse_deliveries_supplier_manual_delivered_check
    CHECK (supplier_manual_delivered = ANY (ARRAY['M'::bpchar, 'S'::bpchar, 'D'::bpchar, 'P'::bpchar, 'C'::bpchar])),
  ADD CONSTRAINT warehouse_deliveries_check1
    CHECK (
      (supplier_manual_delivered = 'D'::bpchar AND customer IS NOT NULL)
      OR
      (supplier_manual_delivered = ANY (ARRAY['S'::bpchar, 'M'::bpchar, 'P'::bpchar, 'C'::bpchar]) AND customer IS NULL)
    );

-- ── 3. warehouse_deliveries: source reference columns ─────────────────────────
ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS source_production_id  uuid,
  ADD COLUMN IF NOT EXISTS source_order_item_id  uuid;

-- ── 4. labor_production: bom_id + widen qty_produced to support fractions ─────
ALTER TABLE labor_production
  ADD COLUMN IF NOT EXISTS bom_id bigint;

ALTER TABLE labor_production
  ALTER COLUMN qty_produced TYPE numeric(10,3) USING qty_produced::numeric(10,3);

-- ── 5. BOM tables ─────────────────────────────────────────────────────────────

-- One active recipe version per (tenant, product)
CREATE TABLE IF NOT EXISTS product_boms (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid      NOT NULL,
  product_id  uuid      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version     int       NOT NULL DEFAULT 1,
  is_active   boolean   NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, version)
);

-- Line items in a recipe — each is a material and the amount consumed per finished unit
CREATE TABLE IF NOT EXISTS bom_items (
  id               bigserial PRIMARY KEY,
  bom_id           bigint    NOT NULL REFERENCES product_boms(id) ON DELETE CASCADE,
  input_product_id uuid      NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty_per_unit     numeric(10,4) NOT NULL CHECK (qty_per_unit > 0)
);

CREATE INDEX IF NOT EXISTS idx_product_boms_tenant_product ON product_boms (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_boms_active         ON product_boms (tenant_id, product_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_bom_items_bom               ON bom_items (bom_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_input             ON bom_items (input_product_id);
