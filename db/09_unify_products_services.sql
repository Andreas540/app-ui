-- ============================================================
-- 09_unify_products_services.sql
-- Unifies products and services into one table.
--
-- Strategy:
--   • Add category + service-specific nullable columns to products
--   • Backfill all services → products (preserving the same UUID)
--   • Add product_id FK to services (points to same UUID)
--   • Migrate order_items: set product_id = service_id where missing
--
-- After this migration:
--   • products WHERE category = 'product'  → physical goods
--   • products WHERE category = 'service'  → booking services
--   • services table stays intact (booking module still joins it for metadata)
--   • order_items always has product_id set
--
-- Run once against the live DB.
-- ============================================================

-- 1. Add category column (default 'product' for all existing rows)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'product';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_category_check,
  ADD CONSTRAINT products_category_check CHECK (category IN ('product', 'service'));

-- 2. Add service-specific nullable columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS external_provider TEXT,
  ADD COLUMN IF NOT EXISTS external_service_id TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS capacity INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_type TEXT,
  ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- 3. Unique index so sync can upsert by external key
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_external_service
  ON products(tenant_id, external_provider, external_service_id)
  WHERE external_service_id IS NOT NULL;

-- 4. Backfill services → products (same UUID preserved)
INSERT INTO products (
  id, tenant_id, name, category,
  external_provider, external_service_id, service_type, description,
  duration_minutes, price_amount, currency, capacity,
  deposit_type, deposit_value, active, created_at
)
SELECT
  id, tenant_id, name, 'service',
  external_provider, external_service_id, service_type, description,
  duration_minutes, price_amount, currency, capacity,
  deposit_type, deposit_value, active, created_at
FROM services
ON CONFLICT (id) DO NOTHING;

-- 5. Add product_id FK to services (transition link; same UUID as service id)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

UPDATE services
SET product_id = id
WHERE product_id IS NULL;

-- 6. Migrate order_items: since services.id = products.id,
--    service_id already IS the product_id — just copy it over.
UPDATE order_items
SET product_id = service_id
WHERE service_id IS NOT NULL
  AND product_id IS NULL;

-- ── Summary ──────────────────────────────────────────────────────────────────
-- After running:
--   SELECT category, COUNT(*) FROM products GROUP BY category;
-- should show both 'product' and 'service' rows.
--
-- SELECT COUNT(*) FROM order_items WHERE service_id IS NOT NULL AND product_id IS NULL;
-- should return 0.
