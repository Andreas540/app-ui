-- Tracks when image_data was last set/changed so external forms can cache-bust the image URL.
-- image_updated_at is set to now() on product create (if image provided) and on every image update.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ;
