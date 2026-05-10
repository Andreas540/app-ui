-- Allow per-tenant control over which users can register cash transactions.
-- Default TRUE so all existing users keep their access after migration.
ALTER TABLE tenant_memberships
  ADD COLUMN IF NOT EXISTS can_report_cash BOOLEAN NOT NULL DEFAULT TRUE;
