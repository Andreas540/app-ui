-- Drop the hardcoded CHECK constraint on customer_type so tenants can store
-- their own custom label (e.g. 'BLV', 'Client') instead of only the
-- built-in values BLV / Direct / Partner.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_type_check;
