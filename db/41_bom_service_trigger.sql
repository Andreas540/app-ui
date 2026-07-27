-- Extend trigger_order_item_delivered_qty to consume BOM materials when a
-- service line's delivered_qty changes. Product lines are unaffected.
-- Run after 40_bom_schema.sql.

CREATE OR REPLACE FUNCTION public.handle_order_item_delivered_qty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta      numeric;
  v_category   text;
  v_bom_id     bigint;
  v_bom_item   record;
  v_tenant_id  uuid;
  v_order_date date;
BEGIN
  IF (OLD.delivered_qty IS DISTINCT FROM NEW.delivered_qty) THEN

    -- ── Customer-order 'D' row (unchanged) ──────────────────────────────────
    DELETE FROM warehouse_deliveries
    WHERE order_id = NEW.order_id
      AND product_id = NEW.product_id
      AND supplier_manual_delivered = 'D';

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

    -- ── BOM service consumption 'C' rows ────────────────────────────────────
    -- Only fires when the delivered line is a service (category = 'service')
    -- with an active recipe. Delta-based: un-delivering reverses proportionally.

    SELECT p.category INTO v_category
    FROM products p
    WHERE p.id = NEW.product_id
    LIMIT 1;

    IF v_category = 'service' THEN
      SELECT pb.id INTO v_bom_id
      FROM orders o
      JOIN product_boms pb ON pb.product_id = NEW.product_id
                           AND pb.tenant_id  = o.tenant_id
                           AND pb.is_active  = TRUE
      WHERE o.id = NEW.order_id
      LIMIT 1;

      IF v_bom_id IS NOT NULL THEN
        v_delta := NEW.delivered_qty - OLD.delivered_qty;

        SELECT o.tenant_id, o.order_date INTO v_tenant_id, v_order_date
        FROM orders o WHERE o.id = NEW.order_id LIMIT 1;

        -- Reverse old 'C' rows for this order-item and re-post using current delta.
        -- Delete-and-recreate (matching the delivery 'D' pattern) is simpler than
        -- accumulating deltas and avoids drift on partial back-and-forth toggles.
        DELETE FROM warehouse_deliveries
        WHERE source_order_item_id = NEW.id
          AND supplier_manual_delivered = 'C'
          AND tenant_id = v_tenant_id;

        IF NEW.delivered_qty > 0 THEN
          FOR v_bom_item IN
            SELECT bi.input_product_id, bi.qty_per_unit, mp.name AS material_name
            FROM bom_items bi
            JOIN products mp ON mp.id = bi.input_product_id
            WHERE bi.bom_id = v_bom_id
          LOOP
            INSERT INTO warehouse_deliveries (
              tenant_id, date, supplier_manual_delivered, product, customer,
              qty, product_id, source_order_item_id
            )
            VALUES (
              v_tenant_id,
              (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,
              'C',
              v_bom_item.material_name,
              NULL,
              -(NEW.delivered_qty * v_bom_item.qty_per_unit),
              v_bom_item.input_product_id,
              NEW.id
            );
          END LOOP;
        END IF;

      END IF; -- has active BOM
    END IF;   -- is service

  END IF;
  RETURN NEW;
END;
$$;
