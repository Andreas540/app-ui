-- Product/service image stored as base64 data URL.
-- Served publicly via /.netlify/functions/serve-product-image?id={product_id}.
-- Displayed as 40×40 thumbnails on external order and booking forms.
-- Client crops to square and resizes to 1600×1600 JPEG at 90% quality before upload (~300–500 KB each).
-- Browser caches the served image (Cache-Control: public, max-age=86400).
-- If thumbnail bandwidth becomes a concern, add image_thumbnail TEXT for a 200×200 version.
-- To migrate to object storage later: change stored value from data URL to CDN URL —
-- no other code changes needed (frontend uses the column value as <img src> directly).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_data TEXT;
