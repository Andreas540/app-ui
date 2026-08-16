-- Audit trail for customer order delivery status changes.
-- Records every change to delivered_quantity so the full history can be shown.

CREATE TABLE IF NOT EXISTS order_delivery_events (
  id                uuid    DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  tenant_id         uuid    NOT NULL,
  order_id          uuid    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivered_quantity integer NOT NULL,
  total_qty         integer NOT NULL,
  delivery_status   text    NOT NULL,
  event_date        date    NOT NULL,
  created_at        timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_delivery_events_status_check
    CHECK (delivery_status IN ('not_delivered', 'partial', 'delivered'))
);

CREATE INDEX IF NOT EXISTS idx_ode_order
  ON order_delivery_events(order_id);

-- Seed one event per order that already has delivery progress, using delivered_at as the date.
-- We can only snapshot current state — intermediate partial steps are not recoverable.
INSERT INTO order_delivery_events
  (tenant_id, order_id, delivered_quantity, total_qty, delivery_status, event_date)
SELECT
  o.tenant_id,
  o.id,
  o.delivered_quantity,
  COALESCE(item_totals.total_qty, 0),
  CASE
    WHEN o.delivered = TRUE                                        THEN 'delivered'
    WHEN o.delivered_quantity > 0                                  THEN 'partial'
    ELSE 'not_delivered'
  END,
  COALESCE(o.delivered_at, CURRENT_DATE)
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(qty)::integer AS total_qty
  FROM order_items
  GROUP BY order_id
) item_totals ON item_totals.order_id = o.id
WHERE o.delivered = TRUE OR o.delivered_quantity > 0;
