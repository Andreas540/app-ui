-- 71: Job title on employees, plus the per-tenant list of selectable titles.
--
-- Deliberately NOT stored in product_categories: that table is for product data and
-- mixing job titles into it would be misleading, whatever its category_type column
-- allows.
--
-- Named job_title rather than role on purpose. tenant_memberships.role already exists
-- and means permissions ('tenant_admin', 'tenant_user'); this is a job description.
-- The UI labels it "Role".

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS job_title TEXT;

CREATE TABLE IF NOT EXISTS public.employee_job_titles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_employee_job_titles_tenant
  ON public.employee_job_titles (tenant_id, name);

-- Seed the list from whatever is already on employees, so an existing value never
-- disappears from the dropdown. No-op on a fresh install.
INSERT INTO public.employee_job_titles (tenant_id, name)
SELECT DISTINCT e.tenant_id, btrim(e.job_title)
  FROM public.employees e
 WHERE e.job_title IS NOT NULL AND btrim(e.job_title) <> ''
ON CONFLICT (tenant_id, name) DO NOTHING;
