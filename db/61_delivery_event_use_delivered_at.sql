-- Fix delivery event trigger: use the order's delivered_at date as event_date
-- instead of CURRENT_DATE.  When the user records a backdated delivery the
-- history entry and timeline dot now land on the correct date.
-- Falls back to CURRENT_DATE only when delivered_at is NULL (e.g. partial
-- delivery with no explicit date chosen).

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
    (NEW.tenant_id, NEW.id, NEW.delivered_quantity, v_total_qty, v_status,
     COALESCE(NEW.delivered_at::date, CURRENT_DATE));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
