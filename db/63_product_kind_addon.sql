-- Rename product_kind value 'coverage' to 'addon'
-- Add-On Products were historically stored as product_kind = 'coverage',
-- which was confusing because 'coverage' describes the warranty concept,
-- not the product classification. 'addon' is the correct generic term.

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_product_kind_check;

UPDATE products
  SET product_kind = 'addon'
  WHERE product_kind = 'coverage';

ALTER TABLE products
  ADD CONSTRAINT products_product_kind_check
  CHECK (product_kind IN ('standard', 'addon'));
