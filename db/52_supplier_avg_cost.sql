-- 52: Supplier average cost method
-- Adds per-product cost method selection and source tagging on cost history rows.
-- No changes to order_items, profit views, or the existing trigger.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_method TEXT NOT NULL DEFAULT 'manual'
  CONSTRAINT products_cost_method_check
    CHECK (cost_method IN ('manual', 'avg_3m', 'avg_6m', 'avg_12m', 'last_purchase'));

ALTER TABLE public.product_cost_history
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
