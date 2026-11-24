-- 78: Breaks entered by a manager, as a duration with no time of day.
--
-- The employee page records WHEN someone was away: break_start -> break_end. The
-- admin timesheet cannot — a manager correcting last Tuesday knows a 30 minute
-- lunch was taken, not that it ran 12:30-13:00. Inventing those times would put
-- fabricated evidence into a payroll record and then show it back to the employee
-- as if it had been tracked, so a break row now comes in one of two shapes:
--
--   tracked   break_start [+ break_end]   duration_minutes NULL
--   entered   break_start NULL            duration_minutes 30
--
-- Payroll is unaffected by which: both reduce the same total. Several entered
-- breaks on one day simply add up, with no times to overlap or order.
--
-- HISTORY SAFETY: the new column is nullable with no default, so every existing
-- row keeps exactly the shape and the arithmetic it has now. The function below is
-- db/75's, with the duration branch added — nothing else in it changes.

-- ---------------------------------------------------------------------------
-- 1. The column, and the two shapes
-- ---------------------------------------------------------------------------
ALTER TABLE public.time_entry_breaks
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- A tracked break always has a start. An entered one never does, so the NOT NULL
-- has to go — the CHECK below is what keeps a row from being neither shape.
ALTER TABLE public.time_entry_breaks
  ALTER COLUMN break_start DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entry_breaks_shape_chk'
  ) THEN
    ALTER TABLE public.time_entry_breaks
      ADD CONSTRAINT time_entry_breaks_shape_chk CHECK (
        (duration_minutes IS NULL AND break_start IS NOT NULL)
        OR (duration_minutes IS NOT NULL AND break_start IS NULL AND break_end IS NULL)
      );
  END IF;

  -- Same ceiling as the fixed-break options (break-config.mjs): long enough for any
  -- real break, short enough that a typo'd 3000 is refused rather than paid out.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entry_breaks_duration_chk'
  ) THEN
    ALTER TABLE public.time_entry_breaks
      ADD CONSTRAINT time_entry_breaks_duration_chk CHECK (
        duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 720)
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. "One break running at a time" must not count entered breaks
-- ---------------------------------------------------------------------------
-- The old index was (time_entry_id) WHERE break_end IS NULL, which reads an entered
-- break as one that is still running. Two of them on a day would collide on it, and
-- a single one would block the employee from starting a real break.
DROP INDEX IF EXISTS public.uniq_time_entry_breaks_one_open;
CREATE UNIQUE INDEX uniq_time_entry_breaks_one_open
  ON public.time_entry_breaks (time_entry_id)
  WHERE break_end IS NULL AND duration_minutes IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Entered breaks deduct too
-- ---------------------------------------------------------------------------
-- db/75's function with one branch added. It stays the single place that computes
-- break_minutes: the AFTER trigger on time_entry_breaks only nudges this row.
CREATE OR REPLACE FUNCTION public.calculate_time_entry_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  emp_hour_salary NUMERIC(10, 2);
  calculated_hours NUMERIC(10, 4);
  work_date_ny DATE;
  effective_breaks INTEGER;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      -- NEW: entered by a manager. No times, so nothing to subtract — the number
      -- is the break.
      WHEN b.duration_minutes IS NOT NULL THEN b.duration_minutes::numeric
      WHEN b.break_end >= b.break_start
        THEN EXTRACT(EPOCH FROM (b.break_end - b.break_start)) / 60.0
      ELSE EXTRACT(EPOCH FROM (b.break_end - b.break_start + INTERVAL '24 hours')) / 60.0
    END
  ), 0)::INTEGER
  INTO effective_breaks
  FROM public.time_entry_breaks b
  WHERE b.tenant_id = NEW.tenant_id
    AND b.time_entry_id = NEW.id
    AND (
      -- An entered break has no start time, so the pre-shift rule below cannot be
      -- applied to it and it always counts. A manager entering a break against a
      -- shift is already asserting it belongs to that shift.
      b.duration_minutes IS NOT NULL
      OR (
        -- Unchanged from db/75: a closed break that started at or after the shift
        -- start. An open break (break_end IS NULL) still deducts nothing until it
        -- is closed, and a break left outside a corrected shift stops counting
        -- without being erased.
        b.break_end IS NOT NULL
        AND (NEW.start_time IS NULL OR b.break_start >= NEW.start_time)
      )
    );

  NEW.break_minutes := effective_breaks;

  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time >= NEW.start_time THEN
      calculated_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
    ELSE
      calculated_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time + INTERVAL '24 hours')) / 3600.0;
    END IF;

    calculated_hours := GREATEST(calculated_hours - (effective_breaks / 60.0), 0);

    NEW.total_hours := calculated_hours;

    -- Pre-existing hardcoded EST, left alone deliberately: it belongs to the
    -- salary-history lookup, not to this change.
    work_date_ny := (NEW.work_date::timestamp AT TIME ZONE 'America/New_York')::date;

    SELECT sch.salary INTO emp_hour_salary
    FROM salary_cost_history sch
    WHERE sch.tenant_id = NEW.tenant_id
      AND sch.employee_id = NEW.employee_id
      AND (sch.effective_from AT TIME ZONE 'America/New_York')::date <= work_date_ny
    ORDER BY sch.effective_from DESC
    LIMIT 1;

    IF emp_hour_salary IS NULL THEN
      SELECT hour_salary INTO emp_hour_salary
      FROM employees
      WHERE id = NEW.employee_id AND tenant_id = NEW.tenant_id;
    END IF;

    IF emp_hour_salary IS NOT NULL THEN
      NEW.salary := calculated_hours * emp_hour_salary;
    ELSE
      NEW.salary := NULL;
    END IF;
  ELSE
    NEW.total_hours := NULL;
    NEW.salary := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. No re-settling pass
-- ---------------------------------------------------------------------------
-- Deliberately absent. No duration_minutes rows exist yet, so every entry would
-- recompute to the number it already has. Entries whose break_minutes was written
-- directly rather than derived from child rows are a separate, deliberate job --
-- see db/backfill_entered_breaks.sql -- and must not be swept up silently here.
