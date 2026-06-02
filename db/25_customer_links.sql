-- Short DB-backed links for customer-specific shared pages.
-- Replaces long HMAC-signed JWT tokens in share URLs.
-- short_id is a 10-char base64url random ID, e.g. "A3kR9mXp2Q".
-- type: 'order' | 'booking' | 'info'
CREATE TABLE IF NOT EXISTS customer_links (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('order', 'booking', 'info')),
  lang        TEXT,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_links_expires ON customer_links(expires_at);
