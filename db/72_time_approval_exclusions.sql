-- 72: Per-approver exclusions for Time Approval.
--
-- A row means: this user may NOT approve time for this employee. Absence of a row
-- means they may. Modelled as exclusions rather than grants so that adding a new
-- employee does not silently remove anyone's ability to approve them.
--
-- This also covers self-approval: link an approver to their own employee record by
-- excluding it. It is a tenant setting rather than a hard rule, so a one-person
-- business is not locked out of approving its own time.

CREATE TABLE IF NOT EXISTS public.time_approval_exclusions (
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, employee_id)
);

-- The approve path asks "is this (user, employee) pair excluded?" on every call.
CREATE INDEX IF NOT EXISTS idx_time_approval_exclusions_lookup
  ON public.time_approval_exclusions (tenant_id, user_id);
