-- 75: A break that happened before the shift's recorded start no longer deducts.
--
-- Clocking in a second time on the same day replaces start_time (there is one
-- time_entries row per employee per day). Breaks live in time_entry_breaks and were
-- untouched by that, so a break taken at 10:00 kept deducting from a shift whose
-- start had moved to 13:00 — time outside the recorded shift reducing the hours
-- inside it.
--
-- Rule: a break counts only if it STARTED at or after the shift start.
--
-- The record is kept either way. Breaks are evidence of when someone was away; a
-- start-time correction should change the arithmetic, not erase the history. If the
-- start time is corrected back, the break starts counting again on its own.

-- ---------------------------------------------------------------------------
-- 1. break_minutes becomes derived, in one place
-- ---------------------------------------------------------------------------
-- Previously two functions had to agree: one summed the breaks, the other consumed
-- the sum. Any input that changed the answer — including start_time, which the
-- breaks trigger never saw — had to remember to re-run the first. Now the BEFORE
-- trigger on time_entries computes it from the child rows every time the row is
-- written, so start_time and break_minutes can never disagree.
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
  -- Closed breaks that fall inside the shift as it now stands. An open break
  -- (break_end IS NULL) still deducts nothing until it is closed.
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      CASE
        WHEN b.break_end >= b.break_start THEN b.break_end - b.break_start
        ELSE b.break_end - b.break_start + INTERVAL '24 hours'
      END
    )) / 60.0
  ), 0)::INTEGER
  INTO effective_breaks
  FROM public.time_entry_breaks b
  WHERE b.tenant_id = NEW.tenant_id
    AND b.time_entry_id = NEW.id
    AND b.break_end IS NOT NULL
    -- The rule. NULL start_time cannot exclude anything, so everything counts.
    AND (NEW.start_time IS NULL OR b.break_start >= NEW.start_time);

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
-- 2. The breaks trigger now only has to nudge the parent
-- ---------------------------------------------------------------------------
-- It no longer computes the total itself — it touches the row so the BEFORE
-- trigger above recomputes. No recursion: that trigger never writes back here.
CREATE OR REPLACE FUNCTION public.sync_time_entry_break_minutes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_entry UUID;
  target_tenant UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_entry  := OLD.time_entry_id;
    target_tenant := OLD.tenant_id;
  ELSE
    target_entry  := NEW.time_entry_id;
    target_tenant := NEW.tenant_id;
  END IF;

  UPDATE public.time_entries
  SET updated_at = NOW()
  WHERE id = target_entry AND tenant_id = target_tenant;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Re-settle existing rows under the new rule
-- ---------------------------------------------------------------------------
-- A no-op write so the BEFORE trigger recomputes entries that have breaks.
-- Rows with no breaks are untouched and keep exactly the hours and salary they
-- have now.
--
-- APPROVED ROWS ARE EXCLUDED. An approved entry is settled payroll, and the
-- standing rule for this app is that a fix starts from now and is correct going
-- forward rather than rewriting what a tenant has already been paid. If an
-- approved row ever does carry a break that started before its clock-in, it keeps
-- its current figure and has to be corrected deliberately by an admin.
--
-- In practice this is expected to touch nothing: breaks only exist once migration
-- 74 is applied and the feature is in use, and none of those can be approved yet.
UPDATE public.time_entries te
SET updated_at = te.updated_at
WHERE te.approved IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.time_entry_breaks b
    WHERE b.time_entry_id = te.id AND b.tenant_id = te.tenant_id
  );
