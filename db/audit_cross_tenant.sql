-- ============================================================================
-- audit_cross_tenant.sql
--
-- NOT A MIGRATION. Deliberately unnumbered so it is never picked up as part of
-- the 00–70 sequence. Nothing in the build runs db/*.sql — run this by hand.
--
-- READ ONLY: one single SELECT statement. No INSERT/UPDATE/DELETE, no DDL, no
-- triggers fired (triggers only fire on data modification), nothing to roll
-- back. Takes only ACCESS SHARE locks, so it never blocks the app.
--
-- PURPOSE
--   Finds rows that reference an entity owned by a DIFFERENT tenant. Nothing in
--   the schema prevents this: every FK is single-column to a global id, and the
--   only composite (tenant_id, ...) FK in 89 tables is on product_cost_history.
--   So a cross-tenant write succeeds silently rather than raising an error.
--
-- WHEN TO RUN
--   * Before adding composite (tenant_id, ...) FKs — if this is clean, they can
--     be added as pure safety rails with no data cleanup.
--   * As the verification pass for a customer transfer between tenants
--     (see the customer-transfer plan: assert zero cross-tenant pointers).
--   * Periodically as tenant volume grows.
--
-- READING THE RESULT
--   Anything non-zero sorts to the top. Note that a check also returns 0 when
--   the table is empty, or when only one tenant holds meaningful data — in that
--   case the zero means "no opportunity for corruption", not "discipline proven".
--   It does NOT catch pointers to rows deleted outright; that is a separate
--   dangling-reference audit.
--
-- Part 1 — a row points at a tenant-owned ENTITY belonging to another tenant.
-- Part 2 — a CHILD row's tenant_id disagrees with its PARENT's tenant_id.
--
-- Every table/column verified against db/*.sql. Last run 2026-10-31: 54/54 OK.
-- ============================================================================

WITH checks AS (

-- ─── Part 1: cross-tenant entity pointers ───────────────────────────────────

  SELECT 'order_items.product_id -> products' AS check_name, COUNT(*) AS bad_rows
    FROM order_items oi
    JOIN orders   o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
   WHERE p.tenant_id <> o.tenant_id

  UNION ALL SELECT 'order_items.service_id -> services', COUNT(*)
    FROM order_items oi
    JOIN orders   o ON o.id = oi.order_id
    JOIN services s ON s.id = oi.service_id
   WHERE s.tenant_id <> o.tenant_id

  UNION ALL SELECT 'order_items.covers_product_id -> products', COUNT(*)
    FROM order_items oi
    JOIN orders   o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.covers_product_id
   WHERE p.tenant_id <> o.tenant_id

  UNION ALL SELECT 'order_items.unit_id -> inventory_units', COUNT(*)
    FROM order_items oi
    JOIN orders          o ON o.id = oi.order_id
    JOIN inventory_units u ON u.id = oi.unit_id
   WHERE u.tenant_id <> o.tenant_id

  UNION ALL SELECT 'order_partners.partner_id -> partners', COUNT(*)
    FROM order_partners op
    JOIN orders   o  ON o.id  = op.order_id
    JOIN partners pa ON pa.id = op.partner_id
   WHERE pa.tenant_id <> o.tenant_id

  UNION ALL SELECT 'customers.partner_id -> partners', COUNT(*)
    FROM customers c
    JOIN partners pa ON pa.id = c.partner_id
   WHERE pa.tenant_id <> c.tenant_id

  UNION ALL SELECT 'bookings.service_id -> services', COUNT(*)
    FROM bookings b
    JOIN services s ON s.id = b.service_id
   WHERE s.tenant_id <> b.tenant_id

  UNION ALL SELECT 'services.product_id -> products', COUNT(*)
    FROM services s
    JOIN products p ON p.id = s.product_id
   WHERE p.tenant_id <> s.tenant_id

  UNION ALL SELECT 'customer_product_offers.product_id -> products', COUNT(*)
    FROM customer_product_offers cpo
    JOIN products p ON p.id = cpo.product_id
   WHERE p.tenant_id <> cpo.tenant_id

  UNION ALL SELECT 'customer_service_offers.service_id -> services', COUNT(*)
    FROM customer_service_offers cso
    JOIN services s ON s.id = cso.service_id
   WHERE s.tenant_id <> cso.tenant_id

  UNION ALL SELECT 'customer_service_availability.service_id -> services', COUNT(*)
    FROM customer_service_availability csa
    JOIN services s ON s.id = csa.service_id
   WHERE s.tenant_id <> csa.tenant_id

  UNION ALL SELECT 'inventory_units.product_id -> products', COUNT(*)
    FROM inventory_units u
    JOIN products p ON p.id = u.product_id
   WHERE p.tenant_id <> u.tenant_id

  UNION ALL SELECT 'inventory_units.order_item_id -> orders', COUNT(*)
    FROM inventory_units u
    JOIN order_items oi ON oi.id = u.order_item_id
    JOIN orders      o  ON o.id  = oi.order_id
   WHERE o.tenant_id <> u.tenant_id

  UNION ALL SELECT 'unit_coverage.coverage_product_id -> products', COUNT(*)
    FROM unit_coverage uc
    JOIN products p ON p.id = uc.coverage_product_id
   WHERE p.tenant_id <> uc.tenant_id

  UNION ALL SELECT 'unit_coverage.unit_id -> inventory_units', COUNT(*)
    FROM unit_coverage uc
    JOIN inventory_units u ON u.id = uc.unit_id
   WHERE u.tenant_id <> uc.tenant_id

  UNION ALL SELECT 'unit_coverage.order_item_id -> orders', COUNT(*)
    FROM unit_coverage uc
    JOIN order_items oi ON oi.id = uc.order_item_id
    JOIN orders      o  ON o.id  = oi.order_id
   WHERE o.tenant_id <> uc.tenant_id

  UNION ALL SELECT 'product_boms.product_id -> products', COUNT(*)
    FROM product_boms pb
    JOIN products p ON p.id = pb.product_id
   WHERE p.tenant_id <> pb.tenant_id

  UNION ALL SELECT 'bom_items.input_product_id -> products', COUNT(*)
    FROM bom_items bi
    JOIN product_boms pb ON pb.id = bi.bom_id
    JOIN products     p  ON p.id  = bi.input_product_id
   WHERE p.tenant_id <> pb.tenant_id

  UNION ALL SELECT 'order_items_suppliers.product_id -> products', COUNT(*)
    FROM order_items_suppliers ois
    JOIN products p ON p.id = ois.product_id
   WHERE p.tenant_id <> ois.tenant_id

  UNION ALL SELECT 'partner_payments.partner_id -> partners', COUNT(*)
    FROM partner_payments pp
    JOIN partners pa ON pa.id = pp.partner_id
   WHERE pa.tenant_id <> pp.tenant_id

  UNION ALL SELECT 'partner_payments.order_id -> orders', COUNT(*)
    FROM partner_payments pp
    JOIN orders o ON o.id = pp.order_id
   WHERE o.tenant_id <> pp.tenant_id

  UNION ALL SELECT 'return_partner_adjustments.partner_id -> partners', COUNT(*)
    FROM return_partner_adjustments rpa
    JOIN returns  r  ON r.id  = rpa.return_id
    JOIN partners pa ON pa.id = rpa.partner_id
   WHERE pa.tenant_id <> r.tenant_id

  UNION ALL SELECT 'return_items.product_id -> products', COUNT(*)
    FROM return_items ri
    JOIN returns  r ON r.id = ri.return_id
    JOIN products p ON p.id = ri.product_id
   WHERE p.tenant_id <> r.tenant_id

  UNION ALL SELECT 'return_items.order_item_id -> orders', COUNT(*)
    FROM return_items ri
    JOIN returns     r  ON r.id  = ri.return_id
    JOIN order_items oi ON oi.id = ri.order_item_id
    JOIN orders      o  ON o.id  = oi.order_id
   WHERE o.tenant_id <> r.tenant_id

  UNION ALL SELECT 'tenant_hidden_products.product_id -> products', COUNT(*)
    FROM tenant_hidden_products thp
    JOIN products p ON p.id = thp.product_id
   WHERE p.tenant_id <> thp.tenant_id

  UNION ALL SELECT 'order_page_products.product_id -> products', COUNT(*)
    FROM order_page_products opp
    JOIN products p ON p.id = opp.product_id
   WHERE p.tenant_id <> opp.tenant_id

  UNION ALL SELECT 'tenant_hidden_partners.partner_id -> partners', COUNT(*)
    FROM tenant_hidden_partners thp
    JOIN partners pa ON pa.id = thp.partner_id
   WHERE pa.tenant_id <> thp.tenant_id

  UNION ALL SELECT 'tenant_partner_sort.partner_id -> partners', COUNT(*)
    FROM tenant_partner_sort tps
    JOIN partners pa ON pa.id = tps.partner_id
   WHERE pa.tenant_id <> tps.tenant_id

-- ─── Part 2: child.tenant_id disagrees with parent.tenant_id ────────────────

  UNION ALL SELECT 'orders.customer_id -> customers', COUNT(*)
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
   WHERE c.tenant_id <> o.tenant_id

  UNION ALL SELECT 'payments.customer_id -> customers', COUNT(*)
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
   WHERE c.tenant_id <> p.tenant_id

  UNION ALL SELECT 'payments.order_id -> orders', COUNT(*)
    FROM payments p
    JOIN orders o ON o.id = p.order_id
   WHERE o.tenant_id <> p.tenant_id

  UNION ALL SELECT 'payments.booking_id -> bookings', COUNT(*)
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
   WHERE b.tenant_id <> p.tenant_id

  UNION ALL SELECT 'invoices.customer_id -> customers', COUNT(*)
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
   WHERE c.tenant_id <> i.tenant_id

  UNION ALL SELECT 'returns.customer_id -> customers', COUNT(*)
    FROM returns r
    JOIN customers c ON c.id = r.customer_id
   WHERE c.tenant_id <> r.tenant_id

  UNION ALL SELECT 'returns.order_id -> orders', COUNT(*)
    FROM returns r
    JOIN orders o ON o.id = r.order_id
   WHERE o.tenant_id <> r.tenant_id

  UNION ALL SELECT 'bookings.customer_id -> customers', COUNT(*)
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
   WHERE c.tenant_id <> b.tenant_id

  UNION ALL SELECT 'order_delivery_events.order_id -> orders', COUNT(*)
    FROM order_delivery_events ode
    JOIN orders o ON o.id = ode.order_id
   WHERE o.tenant_id <> ode.tenant_id

  UNION ALL SELECT 'order_payment_links.order_id -> orders', COUNT(*)
    FROM order_payment_links opl
    JOIN orders o ON o.id = opl.order_id
   WHERE o.tenant_id <> opl.tenant_id

  UNION ALL SELECT 'customer_notes.customer_id -> customers', COUNT(*)
    FROM customer_notes cn
    JOIN customers c ON c.id = cn.customer_id
   WHERE c.tenant_id <> cn.tenant_id

  UNION ALL SELECT 'customer_links.customer_id -> customers', COUNT(*)
    FROM customer_links cl
    JOIN customers c ON c.id = cl.customer_id
   WHERE c.tenant_id <> cl.tenant_id

  UNION ALL SELECT 'customer_messages.customer_id -> customers', COUNT(*)
    FROM customer_messages cm
    JOIN customers c ON c.id = cm.customer_id
   WHERE c.tenant_id <> cm.tenant_id

  UNION ALL SELECT 'customer_payment_tokens.customer_id -> customers', COUNT(*)
    FROM customer_payment_tokens cpt
    JOIN customers c ON c.id = cpt.customer_id
   WHERE c.tenant_id <> cpt.tenant_id

  UNION ALL SELECT 'shipping_cost_history.customer_id -> customers', COUNT(*)
    FROM shipping_cost_history sch
    JOIN customers c ON c.id = sch.customer_id
   WHERE c.tenant_id <> sch.tenant_id

  UNION ALL SELECT 'booking_participants.customer_id -> customers', COUNT(*)
    FROM booking_participants bp
    JOIN customers c ON c.id = bp.customer_id
   WHERE c.tenant_id <> bp.tenant_id

  UNION ALL SELECT 'booking_participants.booking_id -> bookings', COUNT(*)
    FROM booking_participants bp
    JOIN bookings b ON b.id = bp.booking_id
   WHERE b.tenant_id <> bp.tenant_id

  UNION ALL SELECT 'booking_customer_links.customer_id -> customers', COUNT(*)
    FROM booking_customer_links bcl
    JOIN customers c ON c.id = bcl.customer_id
   WHERE c.tenant_id <> bcl.tenant_id

  UNION ALL SELECT 'message_jobs.customer_id -> customers', COUNT(*)
    FROM message_jobs mj
    JOIN customers c ON c.id = mj.customer_id
   WHERE c.tenant_id <> mj.tenant_id

  UNION ALL SELECT 'message_jobs.booking_id -> bookings', COUNT(*)
    FROM message_jobs mj
    JOIN bookings b ON b.id = mj.booking_id
   WHERE b.tenant_id <> mj.tenant_id

  UNION ALL SELECT 'customer_product_offers.customer_id -> customers', COUNT(*)
    FROM customer_product_offers cpo
    JOIN customers c ON c.id = cpo.customer_id
   WHERE c.tenant_id <> cpo.tenant_id

  UNION ALL SELECT 'customer_service_offers.customer_id -> customers', COUNT(*)
    FROM customer_service_offers cso
    JOIN customers c ON c.id = cso.customer_id
   WHERE c.tenant_id <> cso.tenant_id

  UNION ALL SELECT 'customer_service_availability.customer_id -> customers', COUNT(*)
    FROM customer_service_availability csa
    JOIN customers c ON c.id = csa.customer_id
   WHERE c.tenant_id <> csa.tenant_id

  UNION ALL SELECT 'tenant_customer_sort.customer_id -> customers', COUNT(*)
    FROM tenant_customer_sort tcs
    JOIN customers c ON c.id = tcs.customer_id
   WHERE c.tenant_id <> tcs.tenant_id

  UNION ALL SELECT 'tenant_hidden_customers.customer_id -> customers', COUNT(*)
    FROM tenant_hidden_customers thc
    JOIN customers c ON c.id = thc.customer_id
   WHERE c.tenant_id <> thc.tenant_id

  UNION ALL SELECT 'order_items_suppliers.order_id -> orders_suppliers', COUNT(*)
    FROM order_items_suppliers ois
    JOIN orders_suppliers os ON os.id = ois.order_id
   WHERE os.tenant_id <> ois.tenant_id
)
SELECT check_name,
       bad_rows,
       CASE WHEN bad_rows = 0 THEN 'OK' ELSE '*** CROSS-TENANT ***' END AS status
  FROM checks
 ORDER BY bad_rows DESC, check_name;
