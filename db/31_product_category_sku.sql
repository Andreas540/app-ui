-- Migration: product category, subcategory, and SKU fields
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_category    TEXT,
  ADD COLUMN IF NOT EXISTS product_subcategory TEXT,
  ADD COLUMN IF NOT EXISTS sku                 TEXT;
