-- db/12_external_events.sql
-- Tracks events initiated from external-facing pages
-- (shared order form, customer info form, booking page)
-- so app users can see recent activity as a notification badge.

CREATE TABLE IF NOT EXISTS external_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  event_type   TEXT        NOT NULL CHECK (event_type IN ('order', 'customer_info', 'booking')),
  customer_name TEXT,
  extra        JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_events_tenant_created
  ON external_events (tenant_id, created_at DESC);
