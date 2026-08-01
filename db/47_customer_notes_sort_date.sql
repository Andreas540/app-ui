-- Notes need a client-controlled sort position so they stay where they were added
-- in the chronological timeline, not float to the top on reload.
ALTER TABLE customer_notes
  ADD COLUMN IF NOT EXISTS sort_date TIMESTAMPTZ NOT NULL DEFAULT now();
