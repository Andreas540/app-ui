-- Migration 29: General order page tables
--
-- order_page_config: one row per tenant, stores access controls and slug
-- order_page_products: per-tenant per-product display overrides

CREATE TABLE IF NOT EXISTS order_page_config (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  slug            TEXT UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  password_hash   TEXT,
  session_minutes INTEGER,
  geo_countries   TEXT[],
  geo_states      TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_page_products (
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  display_price    NUMERIC(12,2),
  display_qty      INTEGER,
  is_visible       BOOLEAN NOT NULL DEFAULT true,
  label_text       TEXT,
  label_image_data TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, product_id)
);
