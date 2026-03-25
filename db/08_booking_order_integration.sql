-- ============================================================
-- 08_booking_order_integration.sql
-- Bridges the booking world with the order/payment world.
--
-- Strategy: Option B — lightweight bridge columns.
--   • bookings  gets order_id   → the order generated for this booking
--   • orders    gets booking_id → marks an order as booking-sourced
--   • order_items gets service_id + product_id made nullable
--     so a booking order line can reference a service directly
--   • payments  gets booking_id → ties a customer payment to a booking
--
-- Run this once against the live DB. All columns are additive (IF NOT EXISTS).
-- ============================================================

-- 1. Link bookings → orders (the order generated when a booking is created/synced)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_order ON bookings(order_id) WHERE order_id IS NOT NULL;

-- 2. Mark orders as booking-sourced (reverse link, useful for queries)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_booking ON orders(booking_id) WHERE booking_id IS NOT NULL;

-- 3. Allow order_items to reference a service instead of a product
--    (booking orders have a service line, not a product line)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE RESTRICT;

-- Make product_id nullable so service-based lines don't need a product
ALTER TABLE order_items
  ALTER COLUMN product_id DROP NOT NULL;

-- Enforce: every line must reference either a product or a service (not neither)
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_product_or_service,
  ADD CONSTRAINT order_items_product_or_service
    CHECK (product_id IS NOT NULL OR service_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_order_items_service ON order_items(service_id) WHERE service_id IS NOT NULL;

-- 4. Link payments → bookings (payment recorded against a booking)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id) WHERE booking_id IS NOT NULL;

-- ── Notes on next steps ──────────────────────────────────────────────────────
-- When a booking is synced from SimplyBook (or created manually in-app):
--   1. Create order (tenant_id, customer_id, order_date=booking date, booking_id=booking.id)
--   2. Create order_item (order_id, service_id=booking.service_id, qty=1,
--        unit_price=booking.total_amount)
--   3. Set bookings.order_id = new order.id
--   4. If any payment was received: create payment row (customer_id, payment_type,
--        amount, payment_date, order_id, booking_id)
--   5. Keep bookings.payment_status in sync as denormalized fast-read field.
--
-- Upgrade path to Option A (services-as-products):
--   • Add service_id FK to products table
--   • Backfill: for each service create a matching product, set products.service_id
--   • Migrate order_items.service_id → order_items.product_id (via the new product)
--   • Re-add NOT NULL to order_items.product_id, drop service_id column
