-- 79: Shifts that run past midnight — count breaks taken after midnight.
--
-- A shift belongs to the date it was clocked in on. One that runs past midnight is
-- stored on that date with end_time < start_time, which this function has always
-- read as overnight (+24 hours). What it did not do was count a break taken after
-- midnight: db/75 only counts breaks starting at or after start_time, and 00:30 is
-- "before" 14:00 on the clock. The employee was paid for that break.
--
-- HISTORY SAFETY: the only rows this changes are overnight shifts with a break
-- starting before their start_time. Checked on production 2026-11-26 — there are
-- none, so no existing entry recomputes to a different number.
--
-- Before applying, confirm the live function is still db/78's. This must return
-- 5e04fff7b42c59d13ba280dd7027f50e:
--
--   SELECT md5(prosrc) FROM pg_proc WHERE proname = 'calculate_time_entry_totals';
--
-- After applying, the same query returns e7cbf333a754bbfb966ff62400979dd3.
--
-- db/78's function with one condition added. No table changes, no UPDATE pass.

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
      -- Entered by a manager (db/78). No times, so nothing to subtract — the
      -- number is the break.
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
        -- A closed break that started at or after the shift start (db/75). An open
        -- break (break_end IS NULL) still deducts nothing until it is closed, and a
        -- break left outside a corrected shift stops counting without being erased.
        b.break_end IS NOT NULL
        AND (
          NEW.start_time IS NULL
          OR b.break_start >= NEW.start_time
          -- NEW in 79: a shift that runs past midnight (end before start on the
          -- clock). A break taken after midnight reads as "before" the start, so it
          -- also counts when it started before the clock-out.
          OR (
            NEW.end_time IS NOT NULL
            AND NEW.end_time < NEW.start_time
            AND b.break_start < NEW.end_time
          )
        )
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
