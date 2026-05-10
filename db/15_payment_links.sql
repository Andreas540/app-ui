CREATE TABLE IF NOT EXISTS order_payment_links (
  token       TEXT        PRIMARY KEY,
  order_id    UUID        NOT NULL,
  tenant_id   UUID        NOT NULL,
  checkout_url TEXT       NOT NULL,
  provider    TEXT        NOT NULL DEFAULT 'stripe',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_payment_links_order_id ON order_payment_links (order_id);
