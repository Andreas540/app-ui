-- 53: Use tenant timezone in cost history triggers
-- Replaces hardcoded 'America/New_York' with tenants.default_timezone (fallback UTC)
-- in all four trigger functions that compare effective_from against order_date.
-- Must be run together with the product.mjs application-layer changes.

-- 1. after_product_cost_history_change
--    Fires on INSERT/UPDATE to product_cost_history; rewrites order_items.product_cost
--    for all orders in the affected date range.
CREATE OR REPLACE FUNCTION public.after_product_cost_history_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid;
  v_prod   uuid;
  v_from   date;
  v_to     date;
  v_tz     text;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tenant := NEW.tenant_id;
  v_prod   := NEW.product_id;

  SELECT COALESCE(default_timezone, 'UTC') INTO v_tz
  FROM public.tenants WHERE id = v_tenant;

  v_from := (NEW.effective_from AT TIME ZONE v_tz)::date;

  SELECT (h.effective_from AT TIME ZONE v_tz)::date
    INTO v_to
  FROM public.product_cost_history h
  WHERE h.tenant_id = v_tenant
    AND h.product_id = v_prod
    AND h.effective_from > NEW.effective_from
  ORDER BY h.effective_from
  LIMIT 1;

  UPDATE public.order_items oi
  SET product_cost = NEW.cost
  FROM public.orders o
  WHERE o.id = oi.order_id
    AND o.tenant_id = v_tenant
    AND oi.product_id = v_prod
    AND o.order_date >= v_from
    AND (v_to IS NULL OR o.order_date < v_to)
    AND o.product_cost IS NULL;

  RETURN NEW;
END;
$$;

-- 2. after_shipping_cost_history_change
--    Same pattern for shipping_cost_history → order_items.shipping_cost.
CREATE OR REPLACE FUNCTION public.after_shipping_cost_history_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid;
  v_cust   uuid;
  v_from   date;
  v_to     date;
  v_tz     text;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tenant := NEW.tenant_id;
  v_cust   := NEW.customer_id;

  SELECT COALESCE(default_timezone, 'UTC') INTO v_tz
  FROM public.tenants WHERE id = v_tenant;

  v_from := (NEW.effective_from AT TIME ZONE v_tz)::date;

  SELECT (h.effective_from AT TIME ZONE v_tz)::date
    INTO v_to
  FROM public.shipping_cost_history h
  WHERE h.tenant_id = v_tenant
    AND h.customer_id = v_cust
    AND h.effective_from > NEW.effective_from
  ORDER BY h.effective_from
  LIMIT 1;

  UPDATE public.order_items oi
  SET shipping_cost = NEW.shipping_cost
  FROM public.orders o
  WHERE o.id = oi.order_id
    AND o.tenant_id = v_tenant
    AND o.customer_id = v_cust
    AND o.order_date >= v_from
    AND (v_to IS NULL OR o.order_date < v_to)
    AND o.shipping_cost IS NULL;

  RETURN NEW;
END;
$$;

-- 3. blv_set_order_item_amounts
--    Fires on INSERT/UPDATE of order_items; looks up cost history for the order date.
CREATE OR REPLACE FUNCTION public.blv_set_order_item_amounts()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d             date;
  v_tenant_id   uuid;
  v_customer_id uuid;
  v_prod        numeric;
  v_ship        numeric;
  v_tz          text;
BEGIN
  SELECT o.order_date, o.tenant_id, o.customer_id
  INTO d, v_tenant_id, v_customer_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  SELECT COALESCE(default_timezone, 'UTC') INTO v_tz
  FROM public.tenants WHERE id = v_tenant_id;

  IF TG_OP = 'INSERT' THEN
    -- PRODUCT COST: order override → history → product fallback → 0
    SELECT COALESCE(
             o.product_cost,
             (SELECT ph.cost
              FROM public.product_cost_history ph
              WHERE ph.tenant_id = v_tenant_id
                AND ph.product_id = NEW.product_id
                AND (ph.effective_from AT TIME ZONE v_tz)::date <= d
              ORDER BY ph.effective_from DESC
              LIMIT 1)
           )
    INTO v_prod
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    IF v_prod IS NULL THEN
      SELECT p.cost INTO v_prod
      FROM public.products p
      WHERE p.id = NEW.product_id
        AND p.tenant_id = v_tenant_id;
    END IF;

    v_prod := COALESCE(v_prod, 0);

    -- SHIPPING COST: order override → history → customer fallback → 0
    SELECT COALESCE(
             o.shipping_cost,
             (SELECT sh.shipping_cost
              FROM public.shipping_cost_history sh
              WHERE sh.tenant_id = v_tenant_id
                AND sh.customer_id = v_customer_id
                AND (sh.effective_from AT TIME ZONE v_tz)::date <= d
              ORDER BY sh.effective_from DESC
              LIMIT 1)
           )
    INTO v_ship
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    IF v_ship IS NULL THEN
      SELECT c.shipping_cost INTO v_ship
      FROM public.customers c
      WHERE c.id = v_customer_id
        AND c.tenant_id = v_tenant_id;
    END IF;

    v_ship := COALESCE(v_ship, 0);

    NEW.product_cost  := v_prod;
    NEW.shipping_cost := v_ship;
    RETURN NEW;

  ELSE
    -- UPDATE: fill only if NULL
    IF NEW.product_cost IS NULL THEN
      SELECT COALESCE(
               o.product_cost,
               (SELECT ph.cost
                FROM public.product_cost_history ph
                WHERE ph.tenant_id = v_tenant_id
                  AND ph.product_id = NEW.product_id
                  AND (ph.effective_from AT TIME ZONE v_tz)::date <= d
                ORDER BY ph.effective_from DESC
                LIMIT 1)
             )
      INTO v_prod
      FROM public.orders o
      WHERE o.id = NEW.order_id;

      IF v_prod IS NULL THEN
        SELECT p.cost INTO v_prod
        FROM public.products p
        WHERE p.id = NEW.product_id
          AND p.tenant_id = v_tenant_id;
      END IF;

      NEW.product_cost := COALESCE(v_prod, 0);
    END IF;

    IF NEW.shipping_cost IS NULL THEN
      SELECT COALESCE(
               o.shipping_cost,
               (SELECT sh.shipping_cost
                FROM public.shipping_cost_history sh
                WHERE sh.tenant_id = v_tenant_id
                  AND sh.customer_id = v_customer_id
                  AND (sh.effective_from AT TIME ZONE v_tz)::date <= d
                ORDER BY sh.effective_from DESC
                LIMIT 1)
             )
      INTO v_ship
      FROM public.orders o
      WHERE o.id = NEW.order_id;

      IF v_ship IS NULL THEN
        SELECT c.shipping_cost INTO v_ship
        FROM public.customers c
        WHERE c.id = v_customer_id
          AND c.tenant_id = v_tenant_id;
      END IF;

      NEW.shipping_cost := COALESCE(v_ship, 0);
    END IF;

    RETURN NEW;
  END IF;
END;
$$;

-- 4. sync_item_amounts_from_order
--    Fires on UPDATE of orders; syncs cost amounts down to order_items.
CREATE OR REPLACE FUNCTION public.sync_item_amounts_from_order()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tz text;
BEGIN
  IF NOT (
       NEW.product_cost  IS DISTINCT FROM OLD.product_cost
    OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
    OR NEW.order_date    IS DISTINCT FROM OLD.order_date
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(default_timezone, 'UTC') INTO v_tz
  FROM public.tenants WHERE id = NEW.tenant_id;

  UPDATE public.order_items oi
  SET
    product_cost = COALESCE(
      NEW.product_cost,
      (SELECT ph.cost
       FROM public.product_cost_history ph
       WHERE ph.product_id = oi.product_id
         AND (ph.effective_from AT TIME ZONE v_tz)::date <= NEW.order_date
       ORDER BY ph.effective_from DESC
       LIMIT 1)
    ),
    shipping_cost = COALESCE(
      NEW.shipping_cost,
      (SELECT sh.shipping_cost
       FROM public.shipping_cost_history sh
       WHERE sh.customer_id = NEW.customer_id
         AND (sh.effective_from AT TIME ZONE v_tz)::date <= NEW.order_date
       ORDER BY sh.effective_from DESC
       LIMIT 1)
    )
  WHERE oi.order_id = NEW.id;

  RETURN NEW;
END;
$$;
