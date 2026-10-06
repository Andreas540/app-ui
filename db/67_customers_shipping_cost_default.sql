-- Ensure shipping_cost always has a default so programmatic customer creation
-- (e.g. Quick Sales auto-provisioning) doesn't require callers to supply it.
-- Does not affect existing rows.
ALTER TABLE customers ALTER COLUMN shipping_cost SET DEFAULT 0;
