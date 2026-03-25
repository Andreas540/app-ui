--
-- PostgreSQL database dump
--

\restrict lT0E0R5YA4pglIncAgM3krQetJMpLNDeT1XhQkPM7KZaIgE20WngeXHTCK88ji8

-- Dumped from database version 17.8 (a284a84)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: backup_test_data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA backup_test_data;


--
-- Name: pos; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pos;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: _compat_mirror_cost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._compat_mirror_cost() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.cost := NEW.product_cost;  -- ignore whatever the app sends
  RETURN NEW;
END $$;


--
-- Name: after_product_cost_history_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.after_product_cost_history_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tenant uuid;
  v_prod   uuid;
  v_from   date;
  v_to     date;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tenant := NEW.tenant_id;
  v_prod   := NEW.product_id;

  -- Keep your prior behavior: interpret effective_from in New York when turning into a DATE boundary
  v_from := (NEW.effective_from AT TIME ZONE 'America/New_York')::date;

  SELECT (h.effective_from AT TIME ZONE 'America/New_York')::date
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
    AND o.product_cost IS NULL;  -- keep if per-order override exists (it does in your schema)

  RETURN NEW;
END;
$$;


--
-- Name: after_shipping_cost_history_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.after_shipping_cost_history_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tenant uuid;
  v_cust   uuid;
  v_from   date;
  v_to     date;
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tenant := NEW.tenant_id;
  v_cust   := NEW.customer_id;

  v_from := (NEW.effective_from AT TIME ZONE 'America/New_York')::date;

  SELECT (h.effective_from AT TIME ZONE 'America/New_York')::date
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
    AND o.shipping_cost IS NULL;  -- keep if per-order override exists (it does in your schema)

  RETURN NEW;
END;
$$;


--
-- Name: blv_set_order_item_amounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blv_set_order_item_amounts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  d date;
  v_tenant_id uuid;
  v_customer_id uuid;
  v_prod numeric;
  v_ship numeric;
BEGIN
  -- Get order details including tenant_id
  SELECT o.order_date, o.tenant_id, o.customer_id 
  INTO d, v_tenant_id, v_customer_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF TG_OP = 'INSERT' THEN
    -- PRODUCT COST
    -- Priority: 1) orders.product_cost override, 2) product_cost_history, 3) products.cost, 4) default 0
    SELECT COALESCE(
             o.product_cost,
             (SELECT ph.cost
              FROM public.product_cost_history ph
              WHERE ph.tenant_id = v_tenant_id
                AND ph.product_id = NEW.product_id
                AND (ph.effective_from AT TIME ZONE 'America/New_York')::date <= d
              ORDER BY ph.effective_from DESC
              LIMIT 1)
           )
    INTO v_prod
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    -- Fallback to current product cost if no history found
    IF v_prod IS NULL THEN
      SELECT p.cost INTO v_prod
      FROM public.products p
      WHERE p.id = NEW.product_id 
        AND p.tenant_id = v_tenant_id;
    END IF;

    -- Default to 0 if still NULL
    v_prod := COALESCE(v_prod, 0);

    -- SHIPPING COST
    -- Priority: 1) orders.shipping_cost override, 2) shipping_cost_history, 3) customers.shipping_cost, 4) default 0
    SELECT COALESCE(
             o.shipping_cost,
             (SELECT sh.shipping_cost
              FROM public.shipping_cost_history sh
              WHERE sh.tenant_id = v_tenant_id
                AND sh.customer_id = v_customer_id
                AND (sh.effective_from AT TIME ZONE 'America/New_York')::date <= d
              ORDER BY sh.effective_from DESC
              LIMIT 1)
           )
    INTO v_ship
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    -- Fallback to current customer shipping cost if no history found
    IF v_ship IS NULL THEN
      SELECT c.shipping_cost INTO v_ship
      FROM public.customers c
      WHERE c.id = v_customer_id 
        AND c.tenant_id = v_tenant_id;
    END IF;

    -- Default to 0 if still NULL
    v_ship := COALESCE(v_ship, 0);

    NEW.product_cost  := v_prod;
    NEW.shipping_cost := v_ship;
    RETURN NEW;

  ELSE
    -- UPDATE path: fill only if NULL; never raise
    IF NEW.product_cost IS NULL THEN
      SELECT COALESCE(
               o.product_cost,
               (SELECT ph.cost
                FROM public.product_cost_history ph
                WHERE ph.tenant_id = v_tenant_id
                  AND ph.product_id = NEW.product_id
                  AND (ph.effective_from AT TIME ZONE 'America/New_York')::date <= d
                ORDER BY ph.effective_from DESC
                LIMIT 1)
             )
      INTO v_prod
      FROM public.orders o
      WHERE o.id = NEW.order_id;
      
      -- Fallback to current product cost
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
                  AND (sh.effective_from AT TIME ZONE 'America/New_York')::date <= d
                ORDER BY sh.effective_from DESC
                LIMIT 1)
             )
      INTO v_ship
      FROM public.orders o
      WHERE o.id = NEW.order_id;
      
      -- Fallback to current customer shipping cost
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


--
-- Name: blv_set_order_item_cost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.blv_set_order_item_cost() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  hdr_cost       numeric;
  hdr_order_date date;
BEGIN
  -- Read header once
  SELECT o.product_cost, o.order_date
    INTO hdr_cost, hdr_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  -- 1) Header override dominates if present
  IF hdr_cost IS NOT NULL THEN
    NEW.cost := hdr_cost;
    RETURN NEW;
  END IF;

  -- 2) History as of order_date (DATE semantics)
  SELECT ph.cost
    INTO NEW.cost
  FROM public.product_cost_history ph
  WHERE ph.product_id = NEW.product_id
    AND ph.effective_from::date <= hdr_order_date
  ORDER BY ph.effective_from DESC
  LIMIT 1;

  -- 3) No silent fallback: require proper data
  IF NEW.cost IS NULL THEN
    RAISE EXCEPTION 'No product_cost_history row on/before % for product %; set orders.product_cost or add history.',
      hdr_order_date, NEW.product_id;
  END IF;

  RETURN NEW;
END; $$;


--
-- Name: calculate_time_entry_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_time_entry_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  emp_hour_salary NUMERIC(10, 2);
  calculated_hours NUMERIC(10, 4);
  work_date_ny DATE;
BEGIN
  -- Calculate hours if both start_time and end_time are provided
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    -- Calculate difference in hours (handles overnight shifts)
    IF NEW.end_time >= NEW.start_time THEN
      calculated_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
    ELSE
      -- Overnight shift: add 24 hours
      calculated_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time + INTERVAL '24 hours')) / 3600.0;
    END IF;
    
    NEW.total_hours := calculated_hours;
    
    -- Convert work_date to New York timezone for proper date boundary matching
    work_date_ny := (NEW.work_date::timestamp AT TIME ZONE 'America/New_York')::date;
    
    -- Get salary from history based on work_date (most recent effective salary on or before work_date)
    SELECT sch.salary INTO emp_hour_salary
    FROM salary_cost_history sch
    WHERE sch.tenant_id = NEW.tenant_id
      AND sch.employee_id = NEW.employee_id
      AND (sch.effective_from AT TIME ZONE 'America/New_York')::date <= work_date_ny
    ORDER BY sch.effective_from DESC
    LIMIT 1;
    
    -- If no history found, fall back to current employee hour_salary
    IF emp_hour_salary IS NULL THEN
      SELECT hour_salary INTO emp_hour_salary
      FROM employees
      WHERE id = NEW.employee_id AND tenant_id = NEW.tenant_id;
    END IF;
    
    -- Calculate salary if employee has hour_salary set
    IF emp_hour_salary IS NOT NULL THEN
      NEW.salary := calculated_hours * emp_hour_salary;
    ELSE
      NEW.salary := NULL;
    END IF;
  ELSE
    -- If we don't have both times, set both to NULL
    NEW.total_hours := NULL;
    NEW.salary := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: handle_customer_order_delivered(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_customer_order_delivered() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Handle UPDATE: only watch for changes to delivered_quantity
    IF (TG_OP = 'UPDATE') THEN
        -- Only proceed if delivered_quantity actually changed
        IF (OLD.delivered_quantity IS DISTINCT FROM NEW.delivered_quantity) THEN
            
            -- Delete existing warehouse_deliveries records for this order
            -- (We'll recreate them with the new delivered_quantity)
            DELETE FROM warehouse_deliveries 
            WHERE order_id = NEW.id 
              AND supplier_manual_delivered = 'D';
            
            -- If delivered_quantity > 0, create new entries
            IF NEW.delivered_quantity > 0 THEN
                INSERT INTO warehouse_deliveries (
                    tenant_id, date, supplier_manual_delivered, product, customer,
                    qty, order_id, product_id
                )
                SELECT 
                    NEW.tenant_id, 
                    (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,
                    'D', 
                    p.name, 
                    c.name,
                    -NEW.delivered_quantity,  -- Use delivered_quantity from orders table
                    NEW.id, 
                    p.id
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                JOIN customers c ON NEW.customer_id = c.id
                WHERE oi.order_id = NEW.id;
            END IF;
        END IF;
    
    -- Handle INSERT: if order is created with delivered_quantity > 0
    -- (This case is rare - typically handled by manual insert in orders.mjs)
    ELSIF (TG_OP = 'INSERT' AND NEW.delivered_quantity > 0) THEN
        INSERT INTO warehouse_deliveries (
            tenant_id, date, supplier_manual_delivered, product, customer,
            qty, order_id, product_id
        )
        SELECT 
            NEW.tenant_id, 
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,
            'D', 
            p.name, 
            c.name,
            -NEW.delivered_quantity,  -- Use delivered_quantity from orders table
            NEW.id, 
            p.id
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN customers c ON NEW.customer_id = c.id
        WHERE oi.order_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: handle_supplier_order_received(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_supplier_order_received() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Handle UPDATE: only proceed if 'received' column actually changed
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.received IS DISTINCT FROM NEW.received) THEN
            
            -- If received changed to TRUE, create positive entries (receiving into warehouse)
            IF NEW.received = TRUE THEN
                INSERT INTO warehouse_deliveries (
                    tenant_id, date, supplier_manual_delivered, product, customer,
                    qty, order_supplier_id, product_id
                )
                SELECT 
                    NEW.tenant_id, 
                    (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,
                    'S', p.name, NULL,
                    ois.qty, NEW.id, p.id
                FROM order_items_suppliers ois
                JOIN products p ON ois.product_id = p.id
                WHERE ois.order_id = NEW.id;
                
            -- If received changed to FALSE, just delete all entries for this supplier order
            ELSIF NEW.received = FALSE THEN
                DELETE FROM warehouse_deliveries 
                WHERE order_supplier_id = NEW.id 
                  AND supplier_manual_delivered = 'S';
            END IF;
        END IF;
    
    -- Handle INSERT: if supplier order is created with received = TRUE
    ELSIF (TG_OP = 'INSERT' AND NEW.received = TRUE) THEN
        INSERT INTO warehouse_deliveries (
            tenant_id, date, supplier_manual_delivered, product, customer,
            qty, order_supplier_id, product_id
        )
        SELECT 
            NEW.tenant_id, 
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date,
            'S', p.name, NULL,
            ois.qty, NEW.id, p.id
        FROM order_items_suppliers ois
        JOIN products p ON ois.product_id = p.id
        WHERE ois.order_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: next_order_no(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_order_no(p_tenant uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_next bigint;
BEGIN
  -- Insert row if missing, else bump counter atomically
  INSERT INTO tenant_order_counters (tenant_id, last_order_no)
  VALUES (p_tenant, 1)
  ON CONFLICT (tenant_id)
  DO UPDATE SET last_order_no = tenant_order_counters.last_order_no + 1
  RETURNING last_order_no INTO v_next;

  RETURN v_next;
END;
$$;


--
-- Name: orders_suppliers_set_orderno(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.orders_suppliers_set_orderno() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.order_no IS NULL OR NEW.order_no <= 0 THEN
    NEW.order_no := next_order_no(NEW.tenant_id);
  END IF;
  RETURN NEW;
END$$;


--
-- Name: recalculate_time_entries_on_salary_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_time_entries_on_salary_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Recalculate all affected time entries for this employee
  UPDATE time_entries te
  SET salary = te.total_hours * (
    SELECT COALESCE(
      (
        SELECT sch.salary
        FROM salary_cost_history sch
        WHERE sch.tenant_id = te.tenant_id
          AND sch.employee_id = te.employee_id
          AND (sch.effective_from AT TIME ZONE 'America/New_York')::date <= (te.work_date::timestamp AT TIME ZONE 'America/New_York')::date
        ORDER BY sch.effective_from DESC
        LIMIT 1
      ),
      (
        SELECT e.hour_salary
        FROM employees e
        WHERE e.id = te.employee_id AND e.tenant_id = te.tenant_id
      )
    )
  )
  WHERE te.tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND te.employee_id = COALESCE(NEW.employee_id, OLD.employee_id)
    AND te.total_hours IS NOT NULL
    AND te.start_time IS NOT NULL
    AND te.end_time IS NOT NULL;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: set_supplier_order_dates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_supplier_order_dates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Handle delivered checkbox
  IF NEW.delivered = TRUE AND (OLD.delivered = FALSE OR OLD.delivered IS NULL) THEN
    -- Set delivery_date to current date in EST
    NEW.delivery_date := (NOW() AT TIME ZONE 'America/New_York')::date;
  ELSIF NEW.delivered = FALSE AND (OLD.delivered = TRUE OR OLD.delivered IS NULL) THEN
    -- Clear delivery_date when unchecked
    NEW.delivery_date := NULL;
  END IF;

  -- Handle received checkbox
  IF NEW.received = TRUE AND (OLD.received = FALSE OR OLD.received IS NULL) THEN
    -- Set received_date to current date in EST
    NEW.received_date := (NOW() AT TIME ZONE 'America/New_York')::date;
  ELSIF NEW.received = FALSE AND (OLD.received = TRUE OR OLD.received IS NULL) THEN
    -- Clear received_date when unchecked
    NEW.received_date := NULL;
  END IF;

  -- Handle in_customs checkbox
  IF NEW.in_customs = TRUE AND (OLD.in_customs = FALSE OR OLD.in_customs IS NULL) THEN
    -- Set in_customs_date to current date in EST
    NEW.in_customs_date := (NOW() AT TIME ZONE 'America/New_York')::date;
  ELSIF NEW.in_customs = FALSE AND (OLD.in_customs = TRUE OR OLD.in_customs IS NULL) THEN
    -- Clear in_customs_date when unchecked
    NEW.in_customs_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: sync_item_amounts_from_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_item_amounts_from_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT (
       NEW.product_cost  IS DISTINCT FROM OLD.product_cost
    OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
    OR NEW.order_date    IS DISTINCT FROM OLD.order_date
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.order_items oi
  SET
    product_cost = COALESCE(
      NEW.product_cost,
      (SELECT ph.cost
       FROM public.product_cost_history ph
       WHERE ph.product_id = oi.product_id
         AND (ph.effective_from AT TIME ZONE 'America/New_York')::date <= NEW.order_date
       ORDER BY ph.effective_from DESC
       LIMIT 1)
    ),
    shipping_cost = COALESCE(
      NEW.shipping_cost,
      (SELECT sh.shipping_cost
       FROM public.shipping_cost_history sh
       WHERE sh.customer_id = NEW.customer_id
         AND (sh.effective_from AT TIME ZONE 'America/New_York')::date <= NEW.order_date
       ORDER BY sh.effective_from DESC
       LIMIT 1)
    )
  WHERE oi.order_id = NEW.id;

  RETURN NEW;
END;
$$;


--
-- Name: update_tenant_config_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tenant_config_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: customers; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.customers (
    id uuid,
    tenant_id uuid,
    name text,
    created_at timestamp with time zone,
    customer_type text,
    shipping_cost numeric(10,2),
    phone text,
    address1 text,
    address2 text,
    city text,
    state text,
    postal_code text
);


--
-- Name: order_counters; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.order_counters (
    tenant_id uuid,
    next_no integer
);


--
-- Name: order_items; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.order_items (
    id uuid,
    order_id uuid,
    product_id uuid,
    qty integer,
    unit_price numeric(10,2),
    created_at timestamp with time zone,
    cost numeric(10,2)
);


--
-- Name: order_partners; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.order_partners (
    id uuid,
    order_id uuid,
    partner_id uuid,
    amount numeric(10,2),
    created_at timestamp with time zone
);


--
-- Name: orders; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.orders (
    id uuid,
    tenant_id uuid,
    customer_id uuid,
    order_no integer,
    order_date date,
    delivered boolean,
    discount numeric(10,2),
    created_at timestamp with time zone,
    notes text,
    product_cost numeric(10,2),
    shipping_cost numeric(10,2)
);


--
-- Name: partner_payments; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.partner_payments (
    id uuid,
    tenant_id uuid,
    partner_id uuid,
    payment_type character varying(50),
    amount numeric(10,2),
    payment_date date,
    notes text,
    created_at timestamp with time zone
);


--
-- Name: partners; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.partners (
    id uuid,
    tenant_id uuid,
    name text,
    created_at timestamp with time zone,
    phone character varying(50),
    address1 character varying(255),
    address2 character varying(255),
    city character varying(100),
    state character varying(50),
    postal_code character varying(20)
);


--
-- Name: payments; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.payments (
    id uuid,
    tenant_id uuid,
    customer_id uuid,
    payment_type text,
    amount numeric(12,2),
    payment_date date,
    order_id uuid,
    notes text,
    created_at timestamp with time zone
);


--
-- Name: playing_with_neon; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.playing_with_neon (
    id integer,
    name text,
    value real
);


--
-- Name: product_cost_history; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.product_cost_history (
    id uuid,
    product_id uuid,
    cost numeric(10,2),
    effective_from timestamp with time zone,
    created_at timestamp with time zone
);


--
-- Name: products; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.products (
    id uuid,
    tenant_id uuid,
    name text,
    unit_price numeric(10,2),
    created_at timestamp with time zone,
    cost numeric(10,2)
);


--
-- Name: shipping_cost_history; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.shipping_cost_history (
    id uuid,
    tenant_id uuid,
    customer_id uuid,
    shipping_cost numeric(10,2),
    effective_from timestamp with time zone,
    created_at timestamp with time zone
);


--
-- Name: tenants; Type: TABLE; Schema: backup_test_data; Owner: -
--

CREATE TABLE backup_test_data.tenants (
    id uuid,
    name text,
    created_at timestamp with time zone
);


--
-- Name: pos_catalog; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_catalog (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    catalog_object_id text NOT NULL,
    object_type text NOT NULL,
    item_name text,
    variation_name text,
    sku text,
    is_deleted boolean DEFAULT false NOT NULL,
    raw_payload jsonb NOT NULL,
    category_id text
);


--
-- Name: pos_categories; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_categories (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    category_id text NOT NULL,
    category_name text NOT NULL,
    parent_category_id text,
    is_top_level boolean DEFAULT true,
    is_deleted boolean DEFAULT false,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pos_inventory; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_inventory (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    catalog_object_id text NOT NULL,
    catalog_object_type text,
    location_id text NOT NULL,
    state text NOT NULL,
    quantity numeric DEFAULT 0 NOT NULL,
    calculated_at timestamp with time zone,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pos_item_cost; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_item_cost (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    catalog_object_id text NOT NULL,
    unit_cost numeric(18,4) NOT NULL,
    currency character(3) NOT NULL,
    valid_from date DEFAULT ((now() AT TIME ZONE 'America/New_York'::text))::date NOT NULL,
    valid_to date
);


--
-- Name: pos_locations; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_locations (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    location_id text NOT NULL,
    location_name text NOT NULL,
    address text,
    timezone text,
    status text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pos_order_items; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_order_items (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    order_id text NOT NULL,
    payment_id text,
    line_item_uid text NOT NULL,
    catalog_object_id text,
    item_name text,
    sku text,
    quantity numeric(18,4) NOT NULL,
    base_price_amount bigint,
    total_money_amount bigint,
    currency character(3),
    location_id text,
    raw_payload jsonb
);


--
-- Name: pos_payments; Type: TABLE; Schema: pos; Owner: -
--

CREATE TABLE pos.pos_payments (
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    payment_id text NOT NULL,
    order_id text,
    location_id text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    amount bigint NOT NULL,
    currency character(3) NOT NULL,
    status text,
    customer_id text,
    reference_id text,
    raw_payload jsonb
);


--
-- Name: vw_inventory; Type: VIEW; Schema: pos; Owner: -
--

CREATE VIEW pos.vw_inventory AS
 WITH sales_last_30_days AS (
         SELECT oi.tenant_id,
            oi.provider,
            oi.catalog_object_id,
            sum(oi.quantity) AS total_qty_sold,
            (sum(oi.quantity) / 30.0) AS avg_qty_per_day
           FROM (pos.pos_order_items oi
             JOIN pos.pos_payments p ON (((p.tenant_id = oi.tenant_id) AND (p.provider = oi.provider) AND (p.provider_account_id = oi.provider_account_id) AND (p.payment_id = oi.payment_id))))
          WHERE ((p.created_at >= (CURRENT_TIMESTAMP - '30 days'::interval)) AND (p.status = 'COMPLETED'::text))
          GROUP BY oi.tenant_id, oi.provider, oi.catalog_object_id
        )
 SELECT inv.tenant_id,
    inv.provider,
    inv.provider_account_id,
    inv.catalog_object_id,
    inv.location_id,
    c.item_name,
    c.variation_name,
    c.sku,
    cat.category_name,
    inv.state,
    inv.quantity,
    (inv.calculated_at AT TIME ZONE 'America/New_York'::text) AS updated_timestamp_local,
    ic.unit_cost,
    (inv.quantity * ic.unit_cost) AS inventory_value,
    COALESCE(sales.avg_qty_per_day, (0)::numeric) AS qty_sold_per_day_last_30_days,
    COALESCE(sales.total_qty_sold, (0)::numeric) AS qty_sold_last_30_days,
        CASE
            WHEN (COALESCE(sales.avg_qty_per_day, (0)::numeric) > (0)::numeric) THEN (inv.quantity / sales.avg_qty_per_day)
            ELSE NULL::numeric
        END AS days_of_inventory_remaining,
    inv.calculated_at AS calculated_at_utc,
    inv.created_at,
    inv.updated_at,
    loc.location_name
   FROM (((((pos.pos_inventory inv
     LEFT JOIN pos.pos_locations loc ON (((loc.tenant_id = inv.tenant_id) AND (loc.provider = inv.provider) AND (loc.provider_account_id = inv.provider_account_id) AND (loc.location_id = inv.location_id))))
     LEFT JOIN pos.pos_catalog c ON (((c.tenant_id = inv.tenant_id) AND (c.provider = inv.provider) AND (c.provider_account_id = inv.provider_account_id) AND (c.catalog_object_id = inv.catalog_object_id))))
     LEFT JOIN pos.pos_categories cat ON (((cat.tenant_id = inv.tenant_id) AND (cat.provider = c.provider) AND (cat.category_id = c.category_id))))
     LEFT JOIN pos.pos_item_cost ic ON (((ic.tenant_id = inv.tenant_id) AND (ic.provider = inv.provider) AND (ic.provider_account_id = inv.provider_account_id) AND (ic.catalog_object_id = inv.catalog_object_id) AND (ic.valid_from <= CURRENT_DATE) AND ((ic.valid_to IS NULL) OR (ic.valid_to >= CURRENT_DATE)))))
     LEFT JOIN sales_last_30_days sales ON (((sales.tenant_id = inv.tenant_id) AND (sales.provider = inv.provider) AND (sales.catalog_object_id = inv.catalog_object_id))))
  WHERE (inv.state = 'IN_STOCK'::text);


--
-- Name: vw_sales_with_cost; Type: VIEW; Schema: pos; Owner: -
--

CREATE VIEW pos.vw_sales_with_cost AS
 SELECT oi.tenant_id,
    oi.provider,
    oi.provider_account_id,
    p.payment_id,
    p.order_id,
    p.location_id,
    p.status AS payment_status,
    (p.created_at AT TIME ZONE 'America/New_York'::text) AS sale_timestamp_local,
    ((p.created_at AT TIME ZONE 'America/New_York'::text))::date AS sale_date_local,
    oi.line_item_uid,
    COALESCE(c.item_name, oi.item_name) AS item_name,
    COALESCE(c.sku, oi.sku) AS sku,
    oi.catalog_object_id,
    oi.quantity,
    ((oi.base_price_amount)::numeric / 100.0) AS unit_price_ex_tax,
    (((oi.base_price_amount)::numeric * oi.quantity) / 100.0) AS line_revenue_ex_tax,
    ic.unit_cost,
    (oi.quantity * ic.unit_cost) AS line_cost,
    ((((oi.base_price_amount)::numeric * oi.quantity) / 100.0) - (oi.quantity * ic.unit_cost)) AS line_margin,
        CASE
            WHEN ((((oi.base_price_amount)::numeric * oi.quantity) = (0)::numeric) OR (ic.unit_cost IS NULL)) THEN NULL::numeric
            ELSE (((((oi.base_price_amount)::numeric * oi.quantity) / 100.0) - (oi.quantity * ic.unit_cost)) / (((oi.base_price_amount)::numeric * oi.quantity) / 100.0))
        END AS margin_pct,
    c.variation_name
   FROM (((pos.pos_order_items oi
     JOIN pos.pos_payments p ON (((p.tenant_id = oi.tenant_id) AND (p.provider = oi.provider) AND (p.provider_account_id = oi.provider_account_id) AND (p.payment_id = oi.payment_id))))
     LEFT JOIN pos.pos_catalog c ON (((c.tenant_id = oi.tenant_id) AND (c.provider = oi.provider) AND (c.provider_account_id = oi.provider_account_id) AND (c.catalog_object_id = oi.catalog_object_id))))
     LEFT JOIN pos.pos_item_cost ic ON (((ic.tenant_id = oi.tenant_id) AND (ic.provider = oi.provider) AND (ic.provider_account_id = oi.provider_account_id) AND (ic.catalog_object_id = oi.catalog_object_id) AND (ic.valid_from <= ((p.created_at AT TIME ZONE 'America/New_York'::text))::date) AND ((ic.valid_to IS NULL) OR (ic.valid_to >= ((p.created_at AT TIME ZONE 'America/New_York'::text))::date)))));


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid NOT NULL,
    email text,
    is_disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_customer_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_customer_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    external_provider text NOT NULL,
    external_customer_id text NOT NULL,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid,
    customer_id uuid,
    role text DEFAULT 'participant'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider_connection_id uuid,
    external_provider text,
    external_booking_id text,
    external_status text,
    customer_id uuid,
    service_id uuid,
    assigned_user_id uuid,
    assigned_staff_name text,
    booking_status text DEFAULT 'pending'::text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    timezone text,
    location_name text,
    participant_count integer DEFAULT 1 NOT NULL,
    total_amount numeric(12,2),
    currency text,
    notes text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_email text NOT NULL,
    topic text NOT NULL,
    message text NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    answered_at timestamp with time zone
);


--
-- Name: costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_private character(1) NOT NULL,
    cost_category text NOT NULL,
    cost_type text NOT NULL,
    cost text NOT NULL,
    amount numeric(12,2) NOT NULL,
    cost_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT costs_business_private_check CHECK ((business_private = ANY (ARRAY['B'::bpchar, 'P'::bpchar])))
);


--
-- Name: costs_recurring; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.costs_recurring (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_private character(1) NOT NULL,
    cost_category text NOT NULL,
    cost_type text NOT NULL,
    cost text NOT NULL,
    amount numeric(12,2) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    recur_kind text NOT NULL,
    recur_interval integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT chk_rec_dates CHECK (((end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT costs_recurring_business_private_check CHECK ((business_private = ANY (ARRAY['B'::bpchar, 'P'::bpchar]))),
    CONSTRAINT costs_recurring_recur_kind_check CHECK ((recur_kind = ANY (ARRAY['monthly'::text, 'weekly'::text, 'yearly'::text])))
);


--
-- Name: costs_all; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.costs_all AS
 WITH params AS (
         SELECT (CURRENT_DATE + '1 year 6 mons'::interval) AS expand_until
        ), rec_monthly AS (
         SELECT cr.tenant_id,
            cr.id AS recurring_id,
            (gs.gs)::date AS cost_date,
            cr.business_private,
            cr.cost_category,
            cr.cost_type,
            cr.cost,
            cr.amount,
            'recurring'::text AS source
           FROM ((public.costs_recurring cr
             CROSS JOIN params p)
             CROSS JOIN LATERAL generate_series((cr.start_date)::timestamp with time zone, (COALESCE(cr.end_date, (p.expand_until)::date))::timestamp with time zone, ((cr.recur_interval || ' month'::text))::interval) gs(gs))
          WHERE (cr.recur_kind = 'monthly'::text)
        ), rec_weekly AS (
         SELECT cr.tenant_id,
            cr.id,
            (gs.gs)::date AS gs,
            cr.business_private,
            cr.cost_category,
            cr.cost_type,
            cr.cost,
            cr.amount,
            'recurring'::text AS "?column?"
           FROM ((public.costs_recurring cr
             CROSS JOIN params p)
             CROSS JOIN LATERAL generate_series((cr.start_date)::timestamp with time zone, (COALESCE(cr.end_date, (p.expand_until)::date))::timestamp with time zone, ((cr.recur_interval || ' week'::text))::interval) gs(gs))
          WHERE (cr.recur_kind = 'weekly'::text)
        ), rec_yearly AS (
         SELECT cr.tenant_id,
            cr.id,
            (gs.gs)::date AS gs,
            cr.business_private,
            cr.cost_category,
            cr.cost_type,
            cr.cost,
            cr.amount,
            'recurring'::text AS "?column?"
           FROM ((public.costs_recurring cr
             CROSS JOIN params p)
             CROSS JOIN LATERAL generate_series((cr.start_date)::timestamp with time zone, (COALESCE(cr.end_date, (p.expand_until)::date))::timestamp with time zone, ((cr.recur_interval || ' year'::text))::interval) gs(gs))
          WHERE (cr.recur_kind = 'yearly'::text)
        ), nonrec AS (
         SELECT c.tenant_id,
            NULL::uuid AS recurring_id,
            c.cost_date,
            c.business_private,
            c.cost_category,
            c.cost_type,
            c.cost,
            c.amount,
            'one-off'::text AS source
           FROM public.costs c
        )
 SELECT nonrec.tenant_id,
    nonrec.recurring_id,
    nonrec.cost_date,
    nonrec.business_private,
    nonrec.cost_category,
    nonrec.cost_type,
    nonrec.cost,
    nonrec.amount,
    nonrec.source
   FROM nonrec
UNION ALL
 SELECT rec_monthly.tenant_id,
    rec_monthly.recurring_id,
    rec_monthly.cost_date,
    rec_monthly.business_private,
    rec_monthly.cost_category,
    rec_monthly.cost_type,
    rec_monthly.cost,
    rec_monthly.amount,
    rec_monthly.source
   FROM rec_monthly
UNION ALL
 SELECT rec_weekly.tenant_id,
    rec_weekly.id AS recurring_id,
    rec_weekly.gs AS cost_date,
    rec_weekly.business_private,
    rec_weekly.cost_category,
    rec_weekly.cost_type,
    rec_weekly.cost,
    rec_weekly.amount,
    rec_weekly."?column?" AS source
   FROM rec_weekly
UNION ALL
 SELECT rec_yearly.tenant_id,
    rec_yearly.id AS recurring_id,
    rec_yearly.gs AS cost_date,
    rec_yearly.business_private,
    rec_yearly.cost_category,
    rec_yearly.cost_type,
    rec_yearly.cost,
    rec_yearly.amount,
    rec_yearly."?column?" AS source
   FROM rec_yearly;


--
-- Name: costs_all_with_date_key; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.costs_all_with_date_key AS
 SELECT tenant_id,
    recurring_id,
    cost_date,
    business_private,
    cost_category,
    cost_type,
    cost,
    amount,
    source,
    ((((EXTRACT(year FROM cost_date))::integer * 10000) + ((EXTRACT(month FROM cost_date))::integer * 100)) + (EXTRACT(day FROM cost_date))::integer) AS date_key
   FROM public.costs_all;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_type text DEFAULT 'BLV'::text,
    shipping_cost numeric(10,2) DEFAULT 0 NOT NULL,
    phone text,
    address1 text,
    address2 text,
    city text,
    state text,
    postal_code text,
    company_name text,
    partner_id uuid,
    sms_consent boolean DEFAULT false NOT NULL,
    sms_consent_at timestamp with time zone,
    CONSTRAINT customers_customer_type_check CHECK ((customer_type = ANY (ARRAY['BLV'::text, 'Direct'::text, 'Partner'::text])))
);


--
-- Name: employee_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    session_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    email text,
    employee_code text NOT NULL,
    active boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    share_token_hash text,
    share_token_created_at timestamp with time zone,
    hour_salary numeric(10,2)
);


--
-- Name: labor_production; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_production (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    date date NOT NULL,
    no_of_employees integer,
    total_hours numeric(10,2),
    product_id uuid,
    qty_produced integer,
    registered_by text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: message_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid,
    customer_id uuid,
    channel text NOT NULL,
    template_key text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    billable boolean DEFAULT false NOT NULL,
    stripe_reported boolean DEFAULT false NOT NULL,
    provider_message_id text,
    provider_name text,
    error_message text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL
);


--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    template_key text NOT NULL,
    channel text NOT NULL,
    subject text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_counters (
    tenant_id uuid NOT NULL,
    next_no integer NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    qty integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    product_cost numeric,
    shipping_cost numeric,
    cost numeric,
    CONSTRAINT order_items_qty_check CHECK ((qty > 0))
);


--
-- Name: order_items_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    qty integer NOT NULL,
    product_cost numeric(12,3) DEFAULT 0 NOT NULL,
    shipping_cost numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_suppliers_product_cost_check CHECK ((product_cost >= (0)::numeric)),
    CONSTRAINT order_items_suppliers_qty_check CHECK (((qty)::numeric >= (0)::numeric)),
    CONSTRAINT order_items_suppliers_qty_pos CHECK ((qty >= 1)),
    CONSTRAINT order_items_suppliers_shipping_cost_check CHECK ((shipping_cost >= (0)::numeric))
);


--
-- Name: order_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    from_customer_amount numeric(12,2) DEFAULT 0
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    order_no integer NOT NULL,
    order_date date NOT NULL,
    delivered boolean DEFAULT true NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    product_cost numeric(10,2),
    shipping_cost numeric(10,2),
    delivered_quantity integer DEFAULT 0 NOT NULL,
    delivery_status text GENERATED ALWAYS AS (
CASE
    WHEN (delivered = true) THEN 'delivered'::text
    WHEN (delivered_quantity > 0) THEN 'partial'::text
    ELSE 'not_delivered'::text
END) STORED,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivered_quantity_nonnegative CHECK ((delivered_quantity >= 0))
);


--
-- Name: order_revenue_cogs_by_day; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.order_revenue_cogs_by_day AS
 WITH lines AS (
         SELECT o.tenant_id,
            o.order_date AS d,
            ((((EXTRACT(year FROM o.order_date))::integer * 10000) + ((EXTRACT(month FROM o.order_date))::integer * 100)) + (EXTRACT(day FROM o.order_date))::integer) AS date_key,
            ((oi.qty)::numeric * oi.unit_price) AS line_revenue,
            ((oi.qty)::numeric * (COALESCE(oi.product_cost, (0)::numeric) + COALESCE(oi.shipping_cost, (0)::numeric))) AS line_cogs
           FROM (public.orders o
             JOIN public.order_items oi ON ((oi.order_id = o.id)))
        )
 SELECT tenant_id,
    d AS order_date,
    date_key,
    sum(line_revenue) AS revenue_amount,
    sum(line_cogs) AS cogs_amount,
    (sum(line_revenue) - sum(line_cogs)) AS profit_amount
   FROM lines
  GROUP BY tenant_id, d, date_key;


--
-- Name: orders_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    order_no bigint NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    est_delivery_date date,
    delivered boolean DEFAULT false NOT NULL,
    delivery_date date,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    product_cost numeric(12,2) DEFAULT 0 NOT NULL,
    shipping_cost numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    received boolean DEFAULT false NOT NULL,
    in_customs boolean DEFAULT false NOT NULL,
    received_date date,
    in_customs_date date
);


--
-- Name: partner_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    payment_type character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_date date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: partner_to_partner_debt_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_to_partner_debt_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    from_partner_id uuid NOT NULL,
    to_partner_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    partner_payment_id uuid
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone character varying(50),
    address1 character varying(255),
    address2 character varying(255),
    city character varying(100),
    state character varying(50),
    postal_code character varying(20)
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_obligations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid,
    obligation_type text NOT NULL,
    due_amount numeric(12,2) NOT NULL,
    currency text NOT NULL,
    due_at timestamp with time zone,
    obligation_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid,
    obligation_id uuid,
    external_provider text,
    external_payment_id text,
    transaction_type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text NOT NULL,
    transaction_status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    payment_type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date date NOT NULL,
    order_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playing_with_neon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playing_with_neon (
    id integer NOT NULL,
    name text NOT NULL,
    value real
);


--
-- Name: playing_with_neon_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playing_with_neon_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playing_with_neon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playing_with_neon_id_seq OWNED BY public.playing_with_neon.id;


--
-- Name: product_cost_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_cost_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    cost numeric(11,3) NOT NULL,
    effective_from timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT product_cost_history_cost_check CHECK ((cost >= (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cost numeric(11,3)
);


--
-- Name: provider_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    connection_status text DEFAULT 'pending'::text NOT NULL,
    external_account_id text,
    external_account_name text,
    access_token_encrypted text,
    refresh_token_encrypted text,
    token_expires_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    payments_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    currency text,
    country text,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_login text
);


--
-- Name: reminder_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    service_id uuid,
    rule_name text NOT NULL,
    trigger_event text NOT NULL,
    minutes_offset integer NOT NULL,
    channel text NOT NULL,
    template_key text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: revenue_profit_surplus; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.revenue_profit_surplus AS
 WITH orders_filtered AS (
         SELECT o.tenant_id,
            o.order_date AS d
           FROM public.orders o
          WHERE ((o.order_date IS NOT NULL) AND (o.notes IS DISTINCT FROM 'Old tab'::text))
        ), lines AS (
         SELECT o.tenant_id,
            o.order_date AS d,
            ((oi.qty)::numeric * COALESCE(oi.unit_price, (0)::numeric)) AS line_revenue,
            ((oi.qty)::numeric * (COALESCE(oi.product_cost, (0)::numeric) + COALESCE(oi.shipping_cost, (0)::numeric))) AS line_cogs
           FROM (public.orders o
             JOIN public.order_items oi ON ((oi.order_id = o.id)))
          WHERE ((o.order_date IS NOT NULL) AND (o.notes IS DISTINCT FROM 'Old tab'::text))
        ), revenue_cogs_by_day AS (
         SELECT lines.tenant_id,
            lines.d,
            sum(lines.line_revenue) AS revenue_amount,
            sum(lines.line_cogs) AS cogs_amount
           FROM lines
          GROUP BY lines.tenant_id, lines.d
        ), partners_by_day AS (
         SELECT o.tenant_id,
            o.order_date AS d,
            sum(COALESCE(op.amount, (0)::numeric)) AS partner_amount
           FROM (public.orders o
             JOIN public.order_partners op ON ((op.order_id = o.id)))
          WHERE ((o.order_date IS NOT NULL) AND (o.notes IS DISTINCT FROM 'Old tab'::text))
          GROUP BY o.tenant_id, o.order_date
        ), costs_split_by_day AS (
         SELECT c.tenant_id,
            c.cost_date AS d,
            sum(c.amount) FILTER (WHERE (c.cost_category = 'Business recurring cost'::text)) AS business_recurring,
            sum(c.amount) FILTER (WHERE (c.cost_category = 'Business non-recurring cost'::text)) AS business_non_recurring,
            sum(c.amount) FILTER (WHERE (c.cost_category = 'Private recurring cost'::text)) AS private_recurring,
            sum(c.amount) FILTER (WHERE (c.cost_category = 'Private non-recurring cost'::text)) AS private_non_recurring
           FROM public.costs_all c
          GROUP BY c.tenant_id, c.cost_date
        ), all_days AS (
         SELECT orders_filtered.tenant_id,
            orders_filtered.d
           FROM orders_filtered
        UNION
         SELECT costs_split_by_day.tenant_id,
            costs_split_by_day.d
           FROM costs_split_by_day
        )
 SELECT ad.tenant_id,
    ad.d AS order_date,
    ((((EXTRACT(year FROM ad.d))::integer * 10000) + ((EXTRACT(month FROM ad.d))::integer * 100)) + (EXTRACT(day FROM ad.d))::integer) AS date_key,
    COALESCE(r.revenue_amount, (0)::numeric) AS revenue_amount,
    COALESCE(r.cogs_amount, (0)::numeric) AS cogs_amount,
    COALESCE(p.partner_amount, (0)::numeric) AS partner_amount,
    ((COALESCE(r.revenue_amount, (0)::numeric) - COALESCE(r.cogs_amount, (0)::numeric)) - COALESCE(p.partner_amount, (0)::numeric)) AS gross_profit,
    COALESCE(cs.business_recurring, (0)::numeric) AS business_recurring,
    COALESCE(cs.business_non_recurring, (0)::numeric) AS business_non_recurring,
    ((((COALESCE(r.revenue_amount, (0)::numeric) - COALESCE(r.cogs_amount, (0)::numeric)) - COALESCE(p.partner_amount, (0)::numeric)) - COALESCE(cs.business_recurring, (0)::numeric)) - COALESCE(cs.business_non_recurring, (0)::numeric)) AS operating_profit,
    COALESCE(cs.private_recurring, (0)::numeric) AS private_recurring,
    COALESCE(cs.private_non_recurring, (0)::numeric) AS private_non_recurring,
    ((((((COALESCE(r.revenue_amount, (0)::numeric) - COALESCE(r.cogs_amount, (0)::numeric)) - COALESCE(p.partner_amount, (0)::numeric)) - COALESCE(cs.business_recurring, (0)::numeric)) - COALESCE(cs.business_non_recurring, (0)::numeric)) - COALESCE(cs.private_recurring, (0)::numeric)) - COALESCE(cs.private_non_recurring, (0)::numeric)) AS surplus
   FROM (((all_days ad
     LEFT JOIN revenue_cogs_by_day r ON (((r.tenant_id = ad.tenant_id) AND (r.d = ad.d))))
     LEFT JOIN partners_by_day p ON (((p.tenant_id = ad.tenant_id) AND (p.d = ad.d))))
     LEFT JOIN costs_split_by_day cs ON (((cs.tenant_id = ad.tenant_id) AND (cs.d = ad.d))));


--
-- Name: revenue_profit_surplus_by_month; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.revenue_profit_surplus_by_month AS
 SELECT tenant_id,
    (date_trunc('month'::text, (order_date)::timestamp with time zone))::date AS month_start,
    sum(revenue_amount) AS revenue_amount,
    sum(cogs_amount) AS cogs_amount,
    sum(partner_amount) AS partner_amount,
    sum(gross_profit) AS gross_profit,
    sum(business_recurring) AS business_recurring,
    sum(business_non_recurring) AS business_non_recurring,
    sum(operating_profit) AS operating_profit,
    sum(private_recurring) AS private_recurring,
    sum(private_non_recurring) AS private_non_recurring,
    sum(surplus) AS surplus
   FROM public.revenue_profit_surplus
  GROUP BY tenant_id, (date_trunc('month'::text, (order_date)::timestamp with time zone));


--
-- Name: salary_cost_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_cost_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    salary numeric NOT NULL,
    effective_from timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    external_provider text,
    external_service_id text,
    name text NOT NULL,
    service_type text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price_amount numeric(12,2) NOT NULL,
    currency text NOT NULL,
    capacity integer,
    deposit_type text,
    deposit_value numeric(12,2),
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shipping_cost_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_cost_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    shipping_cost numeric(10,2) NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    payment_type text NOT NULL,
    amount numeric NOT NULL,
    payment_date date NOT NULL,
    order_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address1 text,
    address2 text,
    city text,
    state text,
    postal_code text,
    country text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider_connection_id uuid,
    sync_type text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    records_processed integer DEFAULT 0 NOT NULL,
    error_message text
);


--
-- Name: tenant_billing_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_billing_settings (
    tenant_id uuid NOT NULL,
    stripe_subscription_id text,
    stripe_sms_subscription_item_id text,
    sms_price_per_unit numeric(12,4) DEFAULT 0.0200 NOT NULL,
    sms_monthly_cap_amount numeric(12,2) DEFAULT 25.00 NOT NULL,
    booking_addon_enabled boolean DEFAULT false NOT NULL,
    booking_addon_price numeric(12,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_memberships (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role text DEFAULT 'tenant_user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    features jsonb,
    modules jsonb
);


--
-- Name: tenant_module_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_module_quotas (
    tenant_id uuid NOT NULL,
    module_id text NOT NULL,
    max_users integer DEFAULT 0 NOT NULL
);


--
-- Name: tenant_order_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_order_counters (
    tenant_id uuid NOT NULL,
    last_order_no bigint DEFAULT 0 NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text,
    business_type text DEFAULT 'general'::text,
    features jsonb DEFAULT '["dashboard", "customers", "partners", "price-checker", "orders", "payments", "products", "invoices", "inventory", "supply-chain", "suppliers", "supplier-orders", "warehouse", "production", "time-entry", "employees", "time-approval", "costs", "tenant-admin", "settings"]'::jsonb,
    app_icon_192 text,
    app_icon_512 text,
    favicon text,
    app_name character varying(100),
    default_language character varying(10) DEFAULT 'en'::character varying,
    default_locale character varying(10) DEFAULT 'en-US'::character varying,
    available_languages text[] DEFAULT ARRAY['en'::text, 'sv'::text, 'es'::text],
    stripe_customer_id character varying,
    default_currency character varying(10) DEFAULT 'USD'::character varying,
    default_timezone character varying(100) DEFAULT 'UTC'::character varying,
    CONSTRAINT valid_business_type CHECK ((business_type = ANY (ARRAY['general'::text, 'physical_store'::text])))
);


--
-- Name: COLUMN tenants.default_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.default_language IS 'Default language code (ISO 639-1): en, sv, es';


--
-- Name: COLUMN tenants.default_locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.default_locale IS 'Default locale code (ISO 639-1 + ISO 3166-1): en-US, sv-SE, es-ES';


--
-- Name: COLUMN tenants.available_languages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.available_languages IS 'Array of language codes available for this tenant';


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    start_time time(0) without time zone,
    end_time time(0) without time zone,
    total_hours numeric(5,2),
    approved boolean DEFAULT false,
    approved_by text,
    approved_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    salary numeric(10,2)
);


--
-- Name: usage_snapshots_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_snapshots_monthly (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    sms_billable_count integer DEFAULT 0 NOT NULL,
    sms_billed_amount numeric(12,2) DEFAULT 0 NOT NULL,
    stripe_invoice_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    tenant_id uuid,
    action character varying(100) NOT NULL,
    endpoint character varying(255),
    "timestamp" timestamp with time zone DEFAULT now(),
    ip_address character varying(45),
    user_agent text,
    device_type character varying(50),
    browser character varying(50),
    os character varying(50),
    success boolean DEFAULT true,
    error_message text,
    email character varying(255),
    name character varying(255),
    tenant_name character varying(255)
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    name character varying(255),
    role character varying(50) NOT NULL,
    access_level character varying(50),
    tenant_id uuid,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    preferred_language character varying(10),
    preferred_locale character varying(10),
    disabled boolean DEFAULT false NOT NULL,
    preferred_currency character varying(10) DEFAULT NULL::character varying,
    preferred_timezone character varying(100) DEFAULT NULL::character varying,
    CONSTRAINT tenant_users_must_have_tenant CHECK (((((role)::text = 'super_admin'::text) AND (tenant_id IS NULL)) OR (((role)::text <> 'super_admin'::text) AND (tenant_id IS NOT NULL)))),
    CONSTRAINT users_access_level_check CHECK (((access_level)::text = ANY ((ARRAY['admin'::character varying, 'inventory'::character varying])::text[]))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['super_admin'::character varying, 'tenant_admin'::character varying, 'tenant_user'::character varying])::text[])))
);


--
-- Name: COLUMN users.preferred_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.preferred_language IS 'User-specific language override. NULL uses tenant default.';


--
-- Name: COLUMN users.preferred_locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.preferred_locale IS 'User-specific locale override. NULL uses tenant default.';


--
-- Name: warehouse_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    supplier_manual_delivered character(1) NOT NULL,
    product text NOT NULL,
    customer text,
    qty integer NOT NULL,
    product_cost numeric(10,3),
    labor_cost numeric(10,3),
    order_supplier_id uuid,
    order_id uuid,
    product_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes text,
    CONSTRAINT warehouse_deliveries_check CHECK ((supplier_manual_delivered = ANY (ARRAY['M'::bpchar, 'S'::bpchar, 'D'::bpchar, 'P'::bpchar]))),
    CONSTRAINT warehouse_deliveries_check1 CHECK ((((supplier_manual_delivered = 'D'::bpchar) AND (customer IS NOT NULL)) OR ((supplier_manual_delivered = ANY (ARRAY['S'::bpchar, 'M'::bpchar, 'P'::bpchar])) AND (customer IS NULL)))),
    CONSTRAINT warehouse_deliveries_supplier_manual_delivered_check CHECK ((supplier_manual_delivered = ANY (ARRAY['S'::bpchar, 'M'::bpchar, 'D'::bpchar, 'P'::bpchar])))
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    provider text NOT NULL,
    provider_connection_id uuid,
    event_type text NOT NULL,
    external_event_id text,
    payload jsonb NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    processed_at timestamp with time zone,
    processing_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playing_with_neon id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playing_with_neon ALTER COLUMN id SET DEFAULT nextval('public.playing_with_neon_id_seq'::regclass);


--
-- Name: pos_catalog pos_catalog_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_catalog
    ADD CONSTRAINT pos_catalog_pkey PRIMARY KEY (tenant_id, provider, provider_account_id, catalog_object_id);


--
-- Name: pos_categories pos_categories_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_categories
    ADD CONSTRAINT pos_categories_pkey PRIMARY KEY (tenant_id, provider, provider_account_id, category_id);


--
-- Name: pos_inventory pos_inventory_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_inventory
    ADD CONSTRAINT pos_inventory_pkey PRIMARY KEY (tenant_id, provider, provider_account_id, catalog_object_id, location_id, state);


--
-- Name: pos_item_cost pos_item_cost_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_item_cost
    ADD CONSTRAINT pos_item_cost_pkey PRIMARY KEY (tenant_id, provider, provider_account_id, catalog_object_id, valid_from);


--
-- Name: pos_locations pos_locations_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_locations
    ADD CONSTRAINT pos_locations_pkey PRIMARY KEY (tenant_id, provider, provider_account_id, location_id);


--
-- Name: pos_order_items pos_order_items_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_order_items
    ADD CONSTRAINT pos_order_items_pkey PRIMARY KEY (tenant_id, provider, order_id, line_item_uid);


--
-- Name: pos_payments pos_payments_pkey; Type: CONSTRAINT; Schema: pos; Owner: -
--

ALTER TABLE ONLY pos.pos_payments
    ADD CONSTRAINT pos_payments_pkey PRIMARY KEY (tenant_id, provider, payment_id);


--
-- Name: app_users app_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_email_key UNIQUE (email);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: booking_customer_links booking_customer_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_customer_links
    ADD CONSTRAINT booking_customer_links_pkey PRIMARY KEY (id);


--
-- Name: booking_customer_links booking_customer_links_tenant_id_external_provider_external_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_customer_links
    ADD CONSTRAINT booking_customer_links_tenant_id_external_provider_external_key UNIQUE (tenant_id, external_provider, external_customer_id);


--
-- Name: booking_participants booking_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: costs costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costs
    ADD CONSTRAINT costs_pkey PRIMARY KEY (id);


--
-- Name: costs_recurring costs_recurring_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costs_recurring
    ADD CONSTRAINT costs_recurring_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: employee_sessions employee_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_sessions
    ADD CONSTRAINT employee_sessions_pkey PRIMARY KEY (id);


--
-- Name: employee_sessions employee_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_sessions
    ADD CONSTRAINT employee_sessions_session_token_key UNIQUE (session_token);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: labor_production labor_production_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_production
    ADD CONSTRAINT labor_production_pkey PRIMARY KEY (id);


--
-- Name: message_jobs message_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_jobs
    ADD CONSTRAINT message_jobs_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: order_counters order_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_counters
    ADD CONSTRAINT order_counters_pkey PRIMARY KEY (tenant_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_items_suppliers order_items_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items_suppliers
    ADD CONSTRAINT order_items_suppliers_pkey PRIMARY KEY (id);


--
-- Name: order_partners order_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_partners
    ADD CONSTRAINT order_partners_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders_suppliers orders_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_suppliers
    ADD CONSTRAINT orders_suppliers_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tenant_id_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_order_no_key UNIQUE (tenant_id, order_no);


--
-- Name: partner_payments partner_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_payments
    ADD CONSTRAINT partner_payments_pkey PRIMARY KEY (id);


--
-- Name: partner_to_partner_debt_payments partner_to_partner_debt_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_to_partner_debt_payments
    ADD CONSTRAINT partner_to_partner_debt_payments_pkey PRIMARY KEY (id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: partners partners_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: payment_obligations payment_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_obligations
    ADD CONSTRAINT payment_obligations_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: playing_with_neon playing_with_neon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playing_with_neon
    ADD CONSTRAINT playing_with_neon_pkey PRIMARY KEY (id);


--
-- Name: product_cost_history product_cost_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_cost_history
    ADD CONSTRAINT product_cost_history_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_tenant_id_id_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_id_uniq UNIQUE (tenant_id, id);


--
-- Name: provider_connections provider_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_connections
    ADD CONSTRAINT provider_connections_pkey PRIMARY KEY (id);


--
-- Name: reminder_rules reminder_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: salary_cost_history salary_cost_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_cost_history
    ADD CONSTRAINT salary_cost_history_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: shipping_cost_history shipping_cost_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_cost_history
    ADD CONSTRAINT shipping_cost_history_pkey PRIMARY KEY (id);


--
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: sync_runs sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_runs
    ADD CONSTRAINT sync_runs_pkey PRIMARY KEY (id);


--
-- Name: tenant_billing_settings tenant_billing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_billing_settings
    ADD CONSTRAINT tenant_billing_settings_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenant_memberships tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_pkey PRIMARY KEY (user_id, tenant_id);


--
-- Name: tenant_module_quotas tenant_module_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_module_quotas
    ADD CONSTRAINT tenant_module_quotas_pkey PRIMARY KEY (tenant_id, module_id);


--
-- Name: tenant_order_counters tenant_order_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_order_counters
    ADD CONSTRAINT tenant_order_counters_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: salary_cost_history unique_employee_salary_effective_from; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_cost_history
    ADD CONSTRAINT unique_employee_salary_effective_from UNIQUE (employee_id, effective_from);


--
-- Name: employees uq_employees_tenant_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT uq_employees_tenant_code UNIQUE (tenant_id, employee_code);


--
-- Name: labor_production uq_labor_production_tenant_date_product; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_production
    ADD CONSTRAINT uq_labor_production_tenant_date_product UNIQUE (tenant_id, date, product_id);


--
-- Name: time_entries uq_time_entries_employee_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT uq_time_entries_employee_date UNIQUE (tenant_id, employee_id, work_date);


--
-- Name: usage_snapshots_monthly usage_snapshots_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_snapshots_monthly
    ADD CONSTRAINT usage_snapshots_monthly_pkey PRIMARY KEY (id);


--
-- Name: usage_snapshots_monthly usage_snapshots_monthly_tenant_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_snapshots_monthly
    ADD CONSTRAINT usage_snapshots_monthly_tenant_id_period_start_key UNIQUE (tenant_id, period_start);


--
-- Name: user_activity_log user_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouse_deliveries warehouse_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_deliveries
    ADD CONSTRAINT warehouse_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: idx_pos_catalog_category; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX idx_pos_catalog_category ON pos.pos_catalog USING btree (tenant_id, provider, category_id);


--
-- Name: idx_pos_categories_name; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX idx_pos_categories_name ON pos.pos_categories USING btree (tenant_id, provider, category_name);


--
-- Name: idx_pos_categories_parent; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX idx_pos_categories_parent ON pos.pos_categories USING btree (tenant_id, provider, parent_category_id);


--
-- Name: idx_pos_inventory_catalog_object; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX idx_pos_inventory_catalog_object ON pos.pos_inventory USING btree (tenant_id, provider, catalog_object_id);


--
-- Name: idx_pos_inventory_location; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX idx_pos_inventory_location ON pos.pos_inventory USING btree (tenant_id, provider, location_id);


--
-- Name: idx_pos_locations_name; Type: INDEX; Schema: pos; Owner: -
--

CREATE INDEX idx_pos_locations_name ON pos.pos_locations USING btree (tenant_id, provider, location_name);


--
-- Name: costs_cost_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costs_cost_category_idx ON public.costs USING btree (cost_category);


--
-- Name: costs_cost_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costs_cost_date_idx ON public.costs USING btree (cost_date);


--
-- Name: costs_recurring_end_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costs_recurring_end_date_idx ON public.costs_recurring USING btree (end_date);


--
-- Name: costs_recurring_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costs_recurring_start_date_idx ON public.costs_recurring USING btree (start_date);


--
-- Name: costs_recurring_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costs_recurring_tenant_idx ON public.costs_recurring USING btree (tenant_id);


--
-- Name: costs_tenant_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costs_tenant_date_idx ON public.costs USING btree (tenant_id, cost_date);


--
-- Name: employee_sessions_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_sessions_employee_idx ON public.employee_sessions USING btree (employee_id);


--
-- Name: employee_sessions_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_sessions_token_idx ON public.employee_sessions USING btree (session_token);


--
-- Name: idx_booking_customer_links_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_customer_links_customer ON public.booking_customer_links USING btree (customer_id);


--
-- Name: idx_booking_customer_links_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_customer_links_tenant ON public.booking_customer_links USING btree (tenant_id);


--
-- Name: idx_booking_participants_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_participants_booking ON public.booking_participants USING btree (booking_id);


--
-- Name: idx_booking_participants_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_participants_tenant ON public.booking_participants USING btree (tenant_id);


--
-- Name: idx_bookings_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer ON public.bookings USING btree (customer_id);


--
-- Name: idx_bookings_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_service ON public.bookings USING btree (service_id);


--
-- Name: idx_bookings_start_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_start_at ON public.bookings USING btree (tenant_id, start_at);


--
-- Name: idx_bookings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_tenant ON public.bookings USING btree (tenant_id);


--
-- Name: idx_costs_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_costs_category ON public.costs USING btree (cost_category);


--
-- Name: idx_costs_cost_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_costs_cost_date ON public.costs USING btree (cost_date);


--
-- Name: idx_customers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_tenant ON public.customers USING btree (tenant_id);


--
-- Name: idx_employees_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_email ON public.employees USING btree (email);


--
-- Name: idx_employees_share_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_share_token_hash ON public.employees USING btree (share_token_hash) WHERE (share_token_hash IS NOT NULL);


--
-- Name: idx_employees_tenant_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_tenant_active ON public.employees USING btree (tenant_id, active);


--
-- Name: idx_labor_production_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_labor_production_tenant_date ON public.labor_production USING btree (tenant_id, date DESC);


--
-- Name: idx_labor_production_tenant_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_labor_production_tenant_product ON public.labor_production USING btree (tenant_id, product_id);


--
-- Name: idx_message_jobs_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_jobs_scheduled ON public.message_jobs USING btree (status, scheduled_for) WHERE (status = 'queued'::text);


--
-- Name: idx_message_jobs_stripe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_jobs_stripe ON public.message_jobs USING btree (tenant_id, billable, stripe_reported) WHERE ((billable = true) AND (stripe_reported = false));


--
-- Name: idx_message_jobs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_jobs_tenant ON public.message_jobs USING btree (tenant_id);


--
-- Name: idx_message_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_templates_tenant ON public.message_templates USING btree (tenant_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_partners_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_partners_order ON public.order_partners USING btree (order_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_order_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_order_date ON public.orders USING btree (order_date);


--
-- Name: idx_orders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tenant ON public.orders USING btree (tenant_id);


--
-- Name: idx_partner_payments_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_payments_partner ON public.partner_payments USING btree (partner_id, payment_date DESC);


--
-- Name: idx_partner_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_payments_tenant ON public.partner_payments USING btree (tenant_id);


--
-- Name: idx_partner_to_partner_debt_payments_partner_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_to_partner_debt_payments_partner_payment_id ON public.partner_to_partner_debt_payments USING btree (partner_payment_id);


--
-- Name: idx_partners_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_tenant ON public.partners USING btree (tenant_id);


--
-- Name: idx_password_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_password_reset_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_user ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_payment_obligations_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_obligations_booking ON public.payment_obligations USING btree (booking_id);


--
-- Name: idx_payment_obligations_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_obligations_tenant ON public.payment_obligations USING btree (tenant_id);


--
-- Name: idx_payment_transactions_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_booking ON public.payment_transactions USING btree (booking_id);


--
-- Name: idx_payment_transactions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_tenant ON public.payment_transactions USING btree (tenant_id);


--
-- Name: idx_payments_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_customer ON public.payments USING btree (customer_id);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date DESC);


--
-- Name: idx_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant ON public.payments USING btree (tenant_id);


--
-- Name: idx_pch_product_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pch_product_from ON public.product_cost_history USING btree (product_id, effective_from DESC);


--
-- Name: idx_pch_product_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pch_product_time ON public.product_cost_history USING btree (product_id, effective_from DESC);


--
-- Name: idx_products_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tenant ON public.products USING btree (tenant_id);


--
-- Name: idx_provider_connections_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_connections_tenant ON public.provider_connections USING btree (tenant_id);


--
-- Name: idx_recurring_start_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_start_end ON public.costs_recurring USING btree (start_date, end_date);


--
-- Name: idx_reminder_rules_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_tenant ON public.reminder_rules USING btree (tenant_id);


--
-- Name: idx_salary_cost_history_effective_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_cost_history_effective_from ON public.salary_cost_history USING btree (effective_from DESC);


--
-- Name: idx_salary_cost_history_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_cost_history_employee_id ON public.salary_cost_history USING btree (employee_id);


--
-- Name: idx_salary_cost_history_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_cost_history_tenant_id ON public.salary_cost_history USING btree (tenant_id);


--
-- Name: idx_sch_customer_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sch_customer_from ON public.shipping_cost_history USING btree (customer_id, effective_from DESC);


--
-- Name: idx_services_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_tenant ON public.services USING btree (tenant_id);


--
-- Name: idx_shipping_cost_history_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_cost_history_customer ON public.shipping_cost_history USING btree (customer_id, effective_from DESC);


--
-- Name: idx_shipping_cost_history_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_cost_history_tenant ON public.shipping_cost_history USING btree (tenant_id);


--
-- Name: idx_supplier_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payments_date ON public.supplier_payments USING btree (payment_date);


--
-- Name: idx_supplier_payments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payments_order ON public.supplier_payments USING btree (order_id);


--
-- Name: idx_supplier_payments_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payments_supplier ON public.supplier_payments USING btree (supplier_id);


--
-- Name: idx_supplier_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payments_tenant ON public.supplier_payments USING btree (tenant_id);


--
-- Name: idx_sync_runs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_runs_tenant ON public.sync_runs USING btree (tenant_id);


--
-- Name: idx_tenant_memberships_features; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_memberships_features ON public.tenant_memberships USING gin (features);


--
-- Name: idx_tenants_features; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_features ON public.tenants USING gin (features);


--
-- Name: idx_time_entries_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_approved ON public.time_entries USING btree (tenant_id, approved, work_date DESC);


--
-- Name: idx_time_entries_employee_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_employee_date ON public.time_entries USING btree (employee_id, work_date DESC);


--
-- Name: idx_time_entries_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_tenant_date ON public.time_entries USING btree (tenant_id, work_date DESC);


--
-- Name: idx_usage_snapshots_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_snapshots_tenant ON public.usage_snapshots_monthly USING btree (tenant_id);


--
-- Name: idx_user_activity_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_action ON public.user_activity_log USING btree (action);


--
-- Name: idx_user_activity_log_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_email ON public.user_activity_log USING btree (email);


--
-- Name: idx_user_activity_log_tenant_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_tenant_name ON public.user_activity_log USING btree (tenant_name);


--
-- Name: idx_user_activity_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_tenant ON public.user_activity_log USING btree (tenant_id);


--
-- Name: idx_user_activity_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_timestamp ON public.user_activity_log USING btree ("timestamp");


--
-- Name: idx_user_activity_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_user_id ON public.user_activity_log USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- Name: idx_warehouse_deliveries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_deliveries_date ON public.warehouse_deliveries USING btree (date);


--
-- Name: idx_warehouse_deliveries_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_deliveries_product_id ON public.warehouse_deliveries USING btree (product_id);


--
-- Name: idx_warehouse_deliveries_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_deliveries_tenant ON public.warehouse_deliveries USING btree (tenant_id);


--
-- Name: idx_warehouse_deliveries_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_deliveries_type ON public.warehouse_deliveries USING btree (supplier_manual_delivered);


--
-- Name: idx_webhook_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events USING btree (tenant_id);


--
-- Name: idx_webhook_events_unprocessed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_unprocessed ON public.webhook_events USING btree (processed, created_at) WHERE (processed = false);


--
-- Name: ois_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ois_tenant_idx ON public.order_items_suppliers USING btree (tenant_id);


--
-- Name: ois_tenant_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ois_tenant_order_idx ON public.order_items_suppliers USING btree (tenant_id, order_id);


--
-- Name: ois_tenant_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ois_tenant_product_idx ON public.order_items_suppliers USING btree (tenant_id, product_id);


--
-- Name: orders_suppliers_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_suppliers_dates_idx ON public.orders_suppliers USING btree (tenant_id, order_date, est_delivery_date);


--
-- Name: orders_suppliers_delivered_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_suppliers_delivered_idx ON public.orders_suppliers USING btree (tenant_id, delivered);


--
-- Name: orders_suppliers_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_suppliers_tenant_idx ON public.orders_suppliers USING btree (tenant_id);


--
-- Name: orders_suppliers_tenant_orderno_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_suppliers_tenant_orderno_key ON public.orders_suppliers USING btree (tenant_id, order_no);


--
-- Name: orders_suppliers_tenant_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_suppliers_tenant_supplier_idx ON public.orders_suppliers USING btree (tenant_id, supplier_id);


--
-- Name: pch_tenant_product_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pch_tenant_product_effective_idx ON public.product_cost_history USING btree (tenant_id, product_id, effective_from DESC);


--
-- Name: suppliers_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_email_idx ON public.suppliers USING btree (lower(email));


--
-- Name: suppliers_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_tenant_idx ON public.suppliers USING btree (tenant_id);


--
-- Name: suppliers_tenant_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX suppliers_tenant_name_key ON public.suppliers USING btree (tenant_id, lower(name));


--
-- Name: tenant_memberships_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_memberships_tenant_id_idx ON public.tenant_memberships USING btree (tenant_id);


--
-- Name: tenant_memberships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_memberships_user_id_idx ON public.tenant_memberships USING btree (user_id);


--
-- Name: tenants_slug_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenants_slug_uq ON public.tenants USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: uq_bookings_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_bookings_external ON public.bookings USING btree (tenant_id, external_provider, external_booking_id) WHERE (external_booking_id IS NOT NULL);


--
-- Name: uq_employees_tenant_employee_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_employees_tenant_employee_code ON public.employees USING btree (tenant_id, employee_code);


--
-- Name: uq_message_jobs_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_message_jobs_dedup ON public.message_jobs USING btree (tenant_id, booking_id, template_key, channel, scheduled_for) WHERE (booking_id IS NOT NULL);


--
-- Name: uq_message_templates_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_message_templates_key ON public.message_templates USING btree (tenant_id, template_key, channel);


--
-- Name: uq_pch_product_from; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pch_product_from ON public.product_cost_history USING btree (product_id, effective_from);


--
-- Name: uq_provider_connections_tenant_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_provider_connections_tenant_provider ON public.provider_connections USING btree (tenant_id, provider);


--
-- Name: uq_sch_customer_from; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_sch_customer_from ON public.shipping_cost_history USING btree (customer_id, effective_from);


--
-- Name: uq_services_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_services_external ON public.services USING btree (tenant_id, external_provider, external_service_id) WHERE (external_service_id IS NOT NULL);


--
-- Name: order_items blv_set_order_item_amounts_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blv_set_order_item_amounts_ins BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.blv_set_order_item_amounts();


--
-- Name: order_items blv_set_order_item_amounts_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blv_set_order_item_amounts_upd BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.blv_set_order_item_amounts();


--
-- Name: orders blv_sync_item_amounts_from_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blv_sync_item_amounts_from_order AFTER UPDATE OF product_cost, shipping_cost, order_date ON public.orders FOR EACH ROW EXECUTE FUNCTION public.sync_item_amounts_from_order();


--
-- Name: product_cost_history blv_touch_orders_on_pcost_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blv_touch_orders_on_pcost_history AFTER INSERT OR DELETE OR UPDATE ON public.product_cost_history FOR EACH ROW EXECUTE FUNCTION public.after_product_cost_history_change();


--
-- Name: shipping_cost_history blv_touch_orders_on_ship_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blv_touch_orders_on_ship_history AFTER INSERT OR DELETE OR UPDATE ON public.shipping_cost_history FOR EACH ROW EXECUTE FUNCTION public.after_shipping_cost_history_change();


--
-- Name: orders set_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: costs_recurring trg_costs_recurring_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_costs_recurring_updated_at BEFORE UPDATE ON public.costs_recurring FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: costs trg_costs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_costs_updated_at BEFORE UPDATE ON public.costs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: employees trg_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: labor_production trg_labor_production_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_labor_production_updated_at BEFORE UPDATE ON public.labor_production FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: order_items_suppliers trg_ois_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ois_updated_at BEFORE UPDATE ON public.order_items_suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders_suppliers trg_orders_suppliers_set_orderno; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_suppliers_set_orderno BEFORE INSERT ON public.orders_suppliers FOR EACH ROW EXECUTE FUNCTION public.orders_suppliers_set_orderno();


--
-- Name: orders_suppliers trg_orders_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_suppliers_updated_at BEFORE UPDATE ON public.orders_suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: time_entries trg_time_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: time_entries trigger_calculate_time_entry_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_calculate_time_entry_totals BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.calculate_time_entry_totals();


--
-- Name: orders trigger_customer_order_delivered; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_customer_order_delivered AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_customer_order_delivered();


--
-- Name: salary_cost_history trigger_recalc_on_salary_history_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recalc_on_salary_history_change AFTER INSERT OR DELETE OR UPDATE ON public.salary_cost_history FOR EACH ROW EXECUTE FUNCTION public.recalculate_time_entries_on_salary_change();


--
-- Name: orders_suppliers trigger_set_supplier_order_dates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_supplier_order_dates BEFORE UPDATE ON public.orders_suppliers FOR EACH ROW EXECUTE FUNCTION public.set_supplier_order_dates();


--
-- Name: orders_suppliers trigger_set_supplier_order_dates_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_supplier_order_dates_insert BEFORE INSERT ON public.orders_suppliers FOR EACH ROW EXECUTE FUNCTION public.set_supplier_order_dates();


--
-- Name: orders_suppliers trigger_supplier_order_received; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_supplier_order_received AFTER INSERT OR UPDATE ON public.orders_suppliers FOR EACH ROW EXECUTE FUNCTION public.handle_supplier_order_received();


--
-- Name: users users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_users_updated_at();


--
-- Name: order_items z_compat_mirror_cost; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_compat_mirror_cost BEFORE INSERT OR UPDATE OF product_cost, cost ON public.order_items FOR EACH ROW EXECUTE FUNCTION public._compat_mirror_cost();


--
-- Name: booking_customer_links booking_customer_links_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_customer_links
    ADD CONSTRAINT booking_customer_links_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: booking_participants booking_participants_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: booking_participants booking_participants_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_participants
    ADD CONSTRAINT booking_participants_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: bookings bookings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: bookings bookings_provider_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_provider_connection_id_fkey FOREIGN KEY (provider_connection_id) REFERENCES public.provider_connections(id);


--
-- Name: bookings bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: contact_messages contact_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: customers customers_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: customers customers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: employees fk_employees_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: labor_production fk_labor_production_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_production
    ADD CONSTRAINT fk_labor_production_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: labor_production fk_labor_production_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_production
    ADD CONSTRAINT fk_labor_production_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: time_entries fk_time_entries_employee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT fk_time_entries_employee FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: time_entries fk_time_entries_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT fk_time_entries_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: warehouse_deliveries fk_warehouse_deliveries_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_deliveries
    ADD CONSTRAINT fk_warehouse_deliveries_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: warehouse_deliveries fk_warehouse_deliveries_order_supplier_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_deliveries
    ADD CONSTRAINT fk_warehouse_deliveries_order_supplier_id FOREIGN KEY (order_supplier_id) REFERENCES public.orders_suppliers(id) ON DELETE CASCADE;


--
-- Name: message_jobs message_jobs_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_jobs
    ADD CONSTRAINT message_jobs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: message_jobs message_jobs_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_jobs
    ADD CONSTRAINT message_jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: order_items_suppliers ois_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items_suppliers
    ADD CONSTRAINT ois_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_suppliers(id) ON UPDATE RESTRICT ON DELETE CASCADE;


--
-- Name: order_items_suppliers ois_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items_suppliers
    ADD CONSTRAINT ois_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: order_partners order_partners_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_partners
    ADD CONSTRAINT order_partners_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_partners order_partners_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_partners
    ADD CONSTRAINT order_partners_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE RESTRICT;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: orders_suppliers orders_suppliers_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_suppliers
    ADD CONSTRAINT orders_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON UPDATE RESTRICT ON DELETE RESTRICT;


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: partner_payments partner_payments_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_payments
    ADD CONSTRAINT partner_payments_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_to_partner_debt_payments partner_to_partner_debt_payments_from_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_to_partner_debt_payments
    ADD CONSTRAINT partner_to_partner_debt_payments_from_partner_id_fkey FOREIGN KEY (from_partner_id) REFERENCES public.partners(id);


--
-- Name: partner_to_partner_debt_payments partner_to_partner_debt_payments_partner_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_to_partner_debt_payments
    ADD CONSTRAINT partner_to_partner_debt_payments_partner_payment_id_fkey FOREIGN KEY (partner_payment_id) REFERENCES public.partner_payments(id) ON DELETE CASCADE;


--
-- Name: partner_to_partner_debt_payments partner_to_partner_debt_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_to_partner_debt_payments
    ADD CONSTRAINT partner_to_partner_debt_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: partner_to_partner_debt_payments partner_to_partner_debt_payments_to_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_to_partner_debt_payments
    ADD CONSTRAINT partner_to_partner_debt_payments_to_partner_id_fkey FOREIGN KEY (to_partner_id) REFERENCES public.partners(id);


--
-- Name: partners partners_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_obligations payment_obligations_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_obligations
    ADD CONSTRAINT payment_obligations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: payment_transactions payment_transactions_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: payment_transactions payment_transactions_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES public.payment_obligations(id);


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: product_cost_history product_cost_history_tenant_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_cost_history
    ADD CONSTRAINT product_cost_history_tenant_product_fk FOREIGN KEY (tenant_id, product_id) REFERENCES public.products(tenant_id, id) ON DELETE CASCADE;


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reminder_rules reminder_rules_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: salary_cost_history salary_cost_history_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_cost_history
    ADD CONSTRAINT salary_cost_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: shipping_cost_history shipping_cost_history_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_cost_history
    ADD CONSTRAINT shipping_cost_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: supplier_payments supplier_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_suppliers(id) ON DELETE SET NULL;


--
-- Name: supplier_payments supplier_payments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: sync_runs sync_runs_provider_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_runs
    ADD CONSTRAINT sync_runs_provider_connection_id_fkey FOREIGN KEY (provider_connection_id) REFERENCES public.provider_connections(id);


--
-- Name: tenant_memberships tenant_memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_memberships tenant_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_memberships
    ADD CONSTRAINT tenant_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: tenant_module_quotas tenant_module_quotas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_module_quotas
    ADD CONSTRAINT tenant_module_quotas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_activity_log user_activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: webhook_events webhook_events_provider_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_provider_connection_id_fkey FOREIGN KEY (provider_connection_id) REFERENCES public.provider_connections(id);


--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_tenant_isolation ON public.employees USING ((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid));


--
-- Name: labor_production; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labor_production ENABLE ROW LEVEL SECURITY;

--
-- Name: labor_production labor_production_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY labor_production_tenant_isolation ON public.labor_production USING ((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid));


--
-- Name: time_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries time_entries_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY time_entries_tenant_isolation ON public.time_entries USING ((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid));


--
-- PostgreSQL database dump complete
--

\unrestrict lT0E0R5YA4pglIncAgM3krQetJMpLNDeT1XhQkPM7KZaIgE20WngeXHTCK88ji8

