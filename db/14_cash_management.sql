-- 14_cash_management.sql
-- Cash Management module: per-user cash in/out tracking per tenant.

CREATE TABLE IF NOT EXISTS cash_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_pickup', 'salary', 'expense')),
  amount           NUMERIC(12,2) NOT NULL,  -- positive = in, negative = out
  comment          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_tx_tenant ON cash_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_user   ON cash_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_date   ON cash_transactions(transaction_date DESC);
