-- Migration: extend product_categories to allow 'condition' type
ALTER TABLE product_categories
  DROP CONSTRAINT IF EXISTS product_categories_category_type_check;

ALTER TABLE product_categories
  ADD CONSTRAINT product_categories_category_type_check
  CHECK (category_type IN ('category', 'subcategory', 'condition'));
