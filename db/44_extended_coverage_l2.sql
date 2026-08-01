-- Item-Level Inventory — Layer 2: Extended Coverage
-- Adds: product_kind on products (standard/coverage), 4 coverage attribute columns,
--       unit_coverage table (the first generic unit-attachment type).

-- ── 1. product_kind on products ──────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_kind TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_product_kind_check;
ALTER TABLE products
  ADD CONSTRAINT products_product_kind_check
  CHECK (product_kind IN ('standard', 'coverage'));

-- ── 2. Coverage attribute columns on products ─────────────────────────────────
-- Nullable; only populated when product_kind = 'coverage'.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS coverage_duration_days INT,
  ADD COLUMN IF NOT EXISTS coverage_ref           TEXT,
  ADD COLUMN IF NOT EXISTS coverage_issuer_type   TEXT,
  ADD COLUMN IF NOT EXISTS coverage_issuer_name   TEXT;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_coverage_issuer_type_check;
ALTER TABLE products
  ADD CONSTRAINT products_coverage_issuer_type_check
  CHECK (coverage_issuer_type IS NULL OR coverage_issuer_type IN ('manufacturer','shop','third_party'));

-- ── 3. unit_coverage table (first generic unit-attachment) ────────────────────
CREATE TABLE IF NOT EXISTS unit_coverage (
  id                  BIGSERIAL   PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
  unit_id             BIGINT      NOT NULL REFERENCES inventory_units(id)  ON DELETE RESTRICT,
  order_item_id       UUID        NULL     REFERENCES order_items(id)      ON DELETE SET NULL,
  coverage_product_id UUID        NULL     REFERENCES products(id)         ON DELETE SET NULL,
  name                TEXT        NOT NULL,
  issuer_type         TEXT        NOT NULL DEFAULT 'shop',
  issuer_name         TEXT,
  coverage_ref        TEXT,
  start_date          DATE        NOT NULL,
  end_date            DATE        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE unit_coverage
  DROP CONSTRAINT IF EXISTS unit_coverage_issuer_type_check;
ALTER TABLE unit_coverage
  ADD CONSTRAINT unit_coverage_issuer_type_check
  CHECK (issuer_type IN ('manufacturer','shop','third_party'));

CREATE INDEX IF NOT EXISTS idx_unit_coverage_unit
  ON unit_coverage (unit_id);

CREATE INDEX IF NOT EXISTS idx_unit_coverage_order_item
  ON unit_coverage (order_item_id)
  WHERE order_item_id IS NOT NULL;

ALTER TABLE unit_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY unit_coverage_tenant_isolation ON unit_coverage
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);
