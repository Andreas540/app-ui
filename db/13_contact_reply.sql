-- Add in-app reply support to contact_messages
ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS reply      TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
