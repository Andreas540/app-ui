-- Per-user PIN lock columns.
-- pin_hash NULL means user has not set a PIN.
-- pin_locked_until is set server-side after 5 failed attempts.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hash             TEXT,
  ADD COLUMN IF NOT EXISTS pin_set_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until     TIMESTAMPTZ;
