-- Per-product delivery tracking: move delivered qty from order level to line level.
-- Safe to run with no backfill — existing fully-delivered orders are still excluded
-- from Committed via the o.delivered = FALSE gate in the inventory CTEs.

-- 1. Add per-line delivered quantity column
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS delivered_qty NUMERIC NOT NULL DEFAULT 0;

-- 2. Trigger function: fires when order_items.delivered_qty changes.
--    Delete-and-recreate pattern per (order_id, product_id) — mirrors the old orders trigger.
CREATE OR REPLACE FUNCTION public.handle_order_item_delivered_qty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.delivered_qty IS DISTINCT FROM NEW.delivered_qty) THEN

    -- Remove existing 'D' row for this specific product on this order
    DELETE FROM warehouse_deliveries
    WHERE order_id = NEW.order_id
      AND product_id = NEW.product_id
      AND supplier_manual_delivered = 'D';

    -- Re-insert if any qty is now delivered
    IF NEW.delivered_qty > 0 THEN
      INSERT INTO warehouse_deliveries (
        tenant_id, date, supplier_manual_delivered, product, customer,
        qty, order_id, product_id
      )
      SELECT
        o.tenant_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,
        'D',
        p.name,
        c.name,
        -NEW.delivered_qty,
        NEW.order_id,
        NEW.product_id
      FROM orders o
      JOIN products p ON p.id = NEW.product_id
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = NEW.order_id;
    END IF;

  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach new trigger to order_items
DROP TRIGGER IF EXISTS trigger_order_item_delivered_qty ON public.order_items;
CREATE TRIGGER trigger_order_item_delivered_qty
AFTER UPDATE OF delivered_qty ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.handle_order_item_delivered_qty();

-- 4. Drop old order-level trigger — responsibility moves to the line-level trigger above
DROP TRIGGER IF EXISTS trigger_customer_order_delivered ON public.orders;
