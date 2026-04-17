-- Add in-app reply support to contact_messages
ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS reply      TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- Extend external_events event_type check to include message_reply
ALTER TABLE external_events
  DROP CONSTRAINT IF EXISTS external_events_event_type_check;

ALTER TABLE external_events
  ADD CONSTRAINT external_events_event_type_check
  CHECK (event_type IN ('order', 'customer_info', 'booking', 'message_reply'));
