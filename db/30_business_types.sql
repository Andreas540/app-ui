-- Migration: business_types registry
-- Run this against the production DB before deploying the code changes.
--
-- Safety check first:
--   SELECT DISTINCT business_type FROM tenants;
-- All values must be 'general' or 'physical_store' before adding the FK.

CREATE TABLE business_types (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  config_defaults  JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO business_types (id, label) VALUES
  ('general',        'General'),
  ('physical_store', 'Physical Store');

ALTER TABLE tenants
  ADD CONSTRAINT fk_tenant_business_type
  FOREIGN KEY (business_type) REFERENCES business_types(id);
