-- Phase 1: PAX device serial on AMP provider config
ALTER TABLE tenant_payment_providers
  ADD COLUMN IF NOT EXISTS device_serial TEXT;

-- Phase 5: Card-on-file token store
-- Opaque gateway tokens mapped to customers; enables future card-on-file charges
-- and anonymous walk-in matching. Token is unique per tenant (same card = same token).
CREATE TABLE IF NOT EXISTS customer_payment_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  customer_id UUID        NOT NULL,
  token       TEXT        NOT NULL,
  card_type   TEXT,
  last_four   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, token)
);
