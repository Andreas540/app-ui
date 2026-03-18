-- Sprint 6: Resilience — retry_count on message_jobs.
-- Tracks how many times a failed SMS job has been re-queued for retry.
-- Run after 05_reminder_dedup_index.sql.

ALTER TABLE message_jobs
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0;
