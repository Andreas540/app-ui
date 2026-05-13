-- Tenant-level default shipping calculation method.
-- 'per_item' is the only supported value today; 'per_order' is reserved for future use.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_shipping_method TEXT NOT NULL DEFAULT 'per_item';
