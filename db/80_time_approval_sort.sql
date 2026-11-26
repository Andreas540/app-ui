-- 80: Default sort order on Time Approval, per tenant.
--
-- Set in Tenant Admin > Employees > Other. The page starts from this and lets the
-- viewer change it for the visit; nothing they pick there is saved.
--
--   name    employee name (default)
--   code    employee number
--   salary  hourly salary (employees.hour_salary)
--   role    job title (employees.job_title)
--
-- HISTORY SAFETY: two new columns on tenants with defaults that reproduce an
-- alphabetical list. No other table is touched and no trigger fires.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS time_approval_sort TEXT NOT NULL DEFAULT 'name';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS time_approval_sort_desc BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_time_approval_sort_chk'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_time_approval_sort_chk
      CHECK (time_approval_sort IN ('name', 'code', 'salary', 'role'));
  END IF;
END $$;
