-- Store each user's preferred default tenant for login.
-- NULL means no preference (falls back to first membership alphabetically).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_tenant_id UUID
    REFERENCES tenants(id) ON DELETE SET NULL;
