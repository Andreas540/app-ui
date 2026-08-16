-- Replace application-level delivery event inserts with a DB trigger.
-- The trigger fires on any UPDATE that changes delivered_quantity on orders,
-- covering all code paths automatically.
--
-- Deploy order: remove application INSERTs from code first, then run this migration.

CREATE OR REPLACE FUNCTION record_delivery_event() RETURNS trigger AS $$
DECLARE
  v_total_qty integer;
  v_status    text;
BEGIN
  -- Skip if quantity didn't actually change
  IF NEW.delivered_quantity IS NOT DISTINCT FROM OLD.delivered_quantity THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(qty), 0)::integer
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

CREATE TRIGGER trg_delivery_event
AFTER UPDATE OF delivered_quantity ON orders
FOR EACH ROW EXECUTE FUNCTION record_delivery_event();
