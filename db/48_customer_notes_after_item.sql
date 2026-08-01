-- Replace date-midpoint positioning with anchor-based positioning.
-- after_item_id points to the specific order or payment the note was placed after.
-- NULL = note belongs at the top of the timeline.
ALTER TABLE customer_notes
  ADD COLUMN IF NOT EXISTS after_item_id UUID NULL;
