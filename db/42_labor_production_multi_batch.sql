-- Allow multiple production batches for the same product on the same day.
-- Previously one row per (tenant, date, product) was enforced; now each batch
-- is its own row identified by its UUID.

ALTER TABLE labor_production
  DROP CONSTRAINT IF EXISTS uq_labor_production_tenant_date_product;
