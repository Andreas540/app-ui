-- Product/service image stored as base64 data URL.
-- Served publicly via /.netlify/functions/serve-product-image?id={product_id}.
-- Displayed as 40×40 thumbnails on external order and booking forms.
-- Client crops to square and resizes to 600×600 JPEG before upload (~60–100 KB each).
-- To migrate to object storage later: change stored value from data URL to CDN URL —
-- no other code changes needed (frontend uses the column value as <img src> directly).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_data TEXT;
