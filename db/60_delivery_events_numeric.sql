-- Fix delivered_quantity and total_qty columns to numeric so fractional
-- quantities (e.g. 0.25 of a product sold in fractions) are preserved.
-- Safe to run regardless of whether 59 was already run.

ALTER TABLE order_delivery_events
  ALTER COLUMN delivered_quantity TYPE numeric,
  ALTER COLUMN total_qty          TYPE numeric;

CREATE OR REPLACE FUNCTION record_delivery_event() RETURNS trigger AS $$
DECLARE
  v_total_qty numeric;
  v_status    text;
BEGIN
  IF NEW.delivered_quantity IS NOT DISTINCT FROM OLD.delivered_quantity THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(qty), 0)
  INTO v_total_qty
  FROM order_items
  WHERE order_id = NEW.id;

  v_status := CASE
    WHEN NEW.delivered = TRUE AND v_total_qty > 0 AND NEW.delivered_quantity >= v_total_qty
      THEN 'delivered'
    WHEN NEW.delivered_quantity > 0
      THEN 'partial'
    ELSE 'not_delivered'
  END;

  INSERT INTO order_delivery_events
    (tenant_id, order_id, delivered_quantity, total_qty, delivery_status, event_date)
  VALUES
    (NEW.tenant_id, NEW.id, NEW.delivered_quantity, v_total_qty, v_status, CURRENT_DATE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger only if it doesn't already exist (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_delivery_event'
  ) THEN
    CREATE TRIGGER trg_delivery_event
    AFTER UPDATE OF delivered_quantity ON orders
    FOR EACH ROW EXECUTE FUNCTION record_delivery_event();
  END IF;
END;
$$;
