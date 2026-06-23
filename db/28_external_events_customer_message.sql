-- 28_external_events_customer_message.sql
-- Extend external_events event_type check to include customer_message
ALTER TABLE external_events
  DROP CONSTRAINT IF EXISTS external_events_event_type_check;

ALTER TABLE external_events
  ADD CONSTRAINT external_events_event_type_check
  CHECK (event_type IN ('order', 'customer_info', 'booking', 'message_reply', 'customer_message'));
