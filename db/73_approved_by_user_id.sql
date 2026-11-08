-- 73: Record WHO approved a time entry, not just a name string.
--
-- approved_by was a display name sent from the browser. It was the right name in
-- normal use, but it could not be joined to an account, did not survive a rename,
-- was ambiguous between two people with the same name, and was taken on the
-- client's word rather than from the session.
--
-- approved_by stays, as the name captured at the time, so existing rows keep
-- meaning something. New approvals also record the user id, and reads prefer that
-- user's current name so a rename shows through.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_time_entries_approved_by_user
  ON public.time_entries (approved_by_user_id);
