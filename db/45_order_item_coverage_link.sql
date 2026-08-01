-- Order-level coverage link
-- Connects a coverage order line to the product it covers (stable across save/re-insert).
-- Only populated when product_kind = 'coverage'.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS covers_product_id UUID
  REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_covers_product
  ON order_items (covers_product_id)
  WHERE covers_product_id IS NOT NULL;
