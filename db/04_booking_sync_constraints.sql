-- Sprint 3: Unique constraints needed for ON CONFLICT upserts during sync.
-- Run this after 03_booking_module.sql.

-- Bookings: upsert key = (tenant_id, external_provider, external_booking_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_external
  ON bookings (tenant_id, external_provider, external_booking_id)
  WHERE external_booking_id IS NOT NULL;

-- Services: upsert key = (tenant_id, external_provider, external_service_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_services_external
  ON services (tenant_id, external_provider, external_service_id)
  WHERE external_service_id IS NOT NULL;

-- Provider connections: upsert key = (tenant_id, provider)
-- (needed for connect-booking-provider ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_tenant_provider
  ON provider_connections (tenant_id, provider);
