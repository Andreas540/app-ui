-- Add reference document storage to coverage (Add-On) products.
-- Same base64 data-URL pattern as products.image_data.

ALTER TABLE products ADD COLUMN IF NOT EXISTS coverage_doc_data TEXT;
