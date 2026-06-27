-- The valid_business_type CHECK constraint is now superseded by the FK
-- added in migration 30 (fk_tenant_business_type → business_types.id).
-- Drop the hardcoded CHECK so new business types can be assigned to tenants.
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS valid_business_type;
