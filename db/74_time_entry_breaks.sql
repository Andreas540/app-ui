-- 74: Unpaid breaks during a shift.
--
-- Employees clock out for a break on the external time-entry page and clock back in.
-- Break time is UNPAID: it comes off total_hours, and therefore off salary.
--
-- Why a child table rather than break_start/break_end columns on time_entries:
-- a day can hold several breaks (a lunch plus a couple of short ones), and we want
-- to know WHEN each happened, not just the total. time_entries itself stays one row
-- per (tenant_id, employee_id, work_date) — the API relies on that.
--
-- HISTORY SAFETY: break_minutes defaults to 0, so every existing row recomputes to
-- exactly the hours and salary it has now. Nothing about past payroll changes.

-- ---------------------------------------------------------------------------
-- 1. The running total, denormalized onto the parent
-- ---------------------------------------------------------------------------
-- Kept on time_entries so existing reads and the salary-recalc path need no join,
-- and so calculate_time_entry_totals (a BEFORE trigger on this table) can see it
-- without aggregating a child table mid-statement.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. The composite key a tenant-safe child FK needs
-- ---------------------------------------------------------------------------
-- Mirrors products_tenant_id_id_uniq. Without this, a break row could reference a
-- time entry in another tenant and Postgres would accept it — the single-column-FK
-- weakness that runs through this schema. New table, so we get it right from the start.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_tenant_id_id_uniq'
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_tenant_id_id_uniq UNIQUE (tenant_id, id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The breaks themselves
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_entry_breaks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  time_entry_id UUID NOT NULL,
  -- Same type as time_entries.start_time/end_time: a wall-clock time on work_date,
  -- second precision, no timezone.
  break_start   TIME(0) WITHOUT TIME ZONE NOT NULL,
  -- NULL means the break is still running — the employee is away right now.
  break_end     TIME(0) WITHOUT TIME ZONE,
  created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT time_entry_breaks_entry_fk
    FOREIGN KEY (tenant_id, time_entry_id)
    REFERENCES public.time_entries (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_entry_breaks_entry
  ON public.time_entry_breaks (tenant_id, time_entry_id);

-- At most one break running at a time per entry. Without this, a double-tap on
-- "Start break" opens two and the employee can never cleanly end either.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_time_entry_breaks_one_open
  ON public.time_entry_breaks (time_entry_id)
  WHERE break_end IS NULL;

DROP TRIGGER IF EXISTS trg_time_entry_breaks_updated_at ON public.time_entry_breaks;
CREATE TRIGGER trg_time_entry_breaks_updated_at
  BEFORE UPDATE ON public.time_entry_breaks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Keep time_entries.break_minutes in step with its breaks
-- ---------------------------------------------------------------------------
-- Only CLOSED breaks count. An open break deducts nothing, so an employee who is
-- away right now still shows their full hours so far rather than a number that
-- silently shrinks while they are gone.
CREATE OR REPLACE FUNCTION public.sync_time_entry_break_minutes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_entry UUID;
  target_tenant UUID;
  total INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_entry  := OLD.time_entry_id;
    target_tenant := OLD.tenant_id;
  ELSE
    target_entry  := NEW.time_entry_id;
    target_tenant := NEW.tenant_id;
  END IF;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      CASE
        WHEN b.break_end >= b.break_start THEN b.break_end - b.break_start
        -- Break spanning midnight, for consistency with the overnight-shift
        -- handling in calculate_time_entry_totals.
        ELSE b.break_end - b.break_start + INTERVAL '24 hours'
      END
    )) / 60.0
  ), 0)::INTEGER
  INTO total
  FROM public.time_entry_breaks b
  WHERE b.tenant_id = target_tenant
    AND b.time_entry_id = target_entry
    AND b.break_end IS NOT NULL;

  -- This UPDATE fires calculate_time_entry_totals below, which is what recomputes
  -- total_hours and salary. No recursion: that trigger never writes back here.
  UPDATE public.time_entries
  SET break_minutes = total
  WHERE id = target_entry AND tenant_id = target_tenant;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_time_entry_break_minutes ON public.time_entry_breaks;
CREATE TRIGGER trg_sync_time_entry_break_minutes
  AFTER INSERT OR UPDATE OR DELETE ON public.time_entry_breaks
  FOR EACH ROW EXECUTE FUNCTION public.sync_time_entry_break_minutes();

-- ---------------------------------------------------------------------------
-- 5. Subtract breaks when computing paid hours
-- ---------------------------------------------------------------------------
-- Unchanged from the previous version except for the break deduction, marked below.
-- NOTE: the 'America/New_York' literals are pre-existing and deliberately left as
-- they are here — they are part of the known hardcoded-EST issue affecting the
-- salary-history lookup, not something this migration should change silently.
CREATE OR REPLACE FUNCTION public.calculate_time_entry_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  emp_hour_salary NUMERIC(10, 2);
  calculated_hours NUMERIC(10, 4);
  work_date_ny DATE;
BEGIN
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time >= NEW.start_time THEN
      calculated_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
    ELSE
      calculated_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time + INTERVAL '24 hours')) / 3600.0;
    END IF;

    -- NEW: unpaid breaks come off the paid total. Floored at zero so a bad break
    -- record can never produce negative hours or a negative wage.
    calculated_hours := GREATEST(
      calculated_hours - (COALESCE(NEW.break_minutes, 0) / 60.0),
      0
    );

    NEW.total_hours := calculated_hours;

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
