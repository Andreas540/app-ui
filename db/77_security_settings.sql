-- 77: Per-tenant session security.
--
-- How long a browser may sit untouched before the app logs the user out. Until
-- now this was hardcoded at 90 minutes in src/App.tsx for everyone.
--
-- This is the IDLE clock, enforced in the browser (src/hooks/useIdleTimeout.ts).
-- It is not the same as the token's own lifetime, which is the absolute ceiling
-- underneath it — 12 hours from login, set in netlify/functions/utils/jwt.mjs and
-- deliberately not per-tenant: it is the backstop for a stolen token, not a
-- comfort setting.
--
-- Named idle_logout_minutes, next to the existing idle_lock_minutes, which is a
-- different thing: that one raises the PIN overlay, this one ends the session.
-- A tenant will normally want lock < logout.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS idle_logout_minutes INTEGER NOT NULL DEFAULT 90;

-- 5 minutes is already impractical and 12 hours is past the point where the
-- token expires anyway, so anything outside that is a typo rather than a policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_idle_logout_minutes_range'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_idle_logout_minutes_range
      CHECK (idle_logout_minutes BETWEEN 5 AND 720);
  END IF;
END $$;

-- Verification (read-only):
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--    WHERE table_name = 'tenants' AND column_name LIKE 'idle%';
