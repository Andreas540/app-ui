-- Migration: product categories lookup table
CREATE TABLE IF NOT EXISTS product_categories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  category_type TEXT       NOT NULL CHECK (category_type IN ('category', 'subcategory')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, name, category_type)
);

-- Seed from existing products so the dropdown isn't empty on upgrade
INSERT INTO product_categories (tenant_id, name, category_type)
SELECT DISTINCT tenant_id, product_category, 'category'
FROM products WHERE product_category IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO product_categories (tenant_id, name, category_type)
SELECT DISTINCT tenant_id, product_subcategory, 'subcategory'
FROM products WHERE product_subcategory IS NOT NULL
ON CONFLICT DO NOTHING;
