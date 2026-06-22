-- Custom fields column for tenant-specific data from spreadsheet imports.
-- Registry of custom field definitions so the UI can show proper labels.
-- Dedup indexes speed up email/phone lookups during import.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS tenant_custom_field_defs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_key  TEXT NOT NULL,
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_email
  ON customers (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone
  ON customers (tenant_id, phone);
