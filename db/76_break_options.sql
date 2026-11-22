-- 76: Which break options the employee time-entry page offers.
--
-- Two kinds of break now exist:
--
--   flexible  the original one. Start Break -> End Break, the employee's own
--             two taps decide the length.
--   fixed     one tap books a whole break of a set length (30 min today). It is
--             written already closed, so there is nothing to come back from.
--
-- Both end up as ordinary time_entry_breaks rows and are deducted by the same
-- trigger (db/75). Nothing about the arithmetic changes here — this migration only
-- records which buttons a tenant wants its employees to see.
--
-- HISTORY SAFETY: the defaults reproduce today's behaviour exactly. flexible on,
-- no fixed durations, so every existing tenant keeps the page it has now and opts
-- into the 30-minute button deliberately.

-- Start/End Break. A tenant that does not want employees logging breaks at all can
-- turn this off and offer no fixed durations either; the page then shows no break
-- controls, which is how it behaved before db/74.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS break_flexible_enabled BOOLEAN NOT NULL DEFAULT true;

-- Offered one-tap durations, in minutes. '{30}' turns on the 30-minute button.
--
-- An array rather than a boolean per duration: adding 15 or 60 later is then a
-- settings change, not a schema change. Deliberately NOT constrained to a
-- whitelist of allowed values — that would be the same duration list written in
-- two places that have to agree, which is exactly what db/75 removed. The API is
-- the only writer and validates the values (see utils/break-config.mjs).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS break_fixed_minutes INTEGER[] NOT NULL DEFAULT '{}'::integer[];

-- ---------------------------------------------------------------------------
-- Verification (read-only)
-- ---------------------------------------------------------------------------
-- The fixed break relies on the db/75 version of the deduction, the one that sums
-- CLOSED breaks inside the shift. Confirm the live function is that version before
-- trusting the 30-minute button to actually come off the hours:
--
--   SELECT prosrc LIKE '%effective_breaks%' AS has_75_version
--   FROM pg_proc WHERE proname = 'calculate_time_entry_totals';
--
-- And that the columns above landed:
--
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--    WHERE table_name = 'tenants' AND column_name LIKE 'break%';
