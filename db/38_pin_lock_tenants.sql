-- Per-tenant PIN lock settings.
-- pin_lock_enabled OFF = behaviour identical to today (single hard-logout timer).
-- pin_length: 4 or 6 digits (enforced by CHECK).
-- idle_lock_minutes: 5-60 min inactivity before lock overlay (enforced by CHECK).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS pin_lock_enabled   BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pin_length         SMALLINT NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS idle_lock_minutes  SMALLINT NOT NULL DEFAULT 15;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_pin_length_check,
  DROP CONSTRAINT IF EXISTS tenants_idle_lock_minutes_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_pin_length_check        CHECK (pin_length IN (4, 6)),
  ADD CONSTRAINT tenants_idle_lock_minutes_check CHECK (idle_lock_minutes BETWEEN 5 AND 60);
