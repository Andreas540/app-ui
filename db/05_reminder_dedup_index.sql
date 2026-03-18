-- Sprint 4: De-duplication index for message_jobs.
-- Prevents duplicate reminder jobs for the same booking + template + scheduled time.
-- Run after 04_booking_sync_constraints.sql.

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_jobs_dedup
  ON message_jobs (tenant_id, booking_id, template_key, channel, scheduled_for)
  WHERE booking_id IS NOT NULL;

-- message_templates: unique per tenant + key + channel (needed for upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_key
  ON message_templates (tenant_id, template_key, channel);
