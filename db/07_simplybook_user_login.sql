-- Sprint 7: SimplyBook auth fix — store user_login for getUserToken
ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS user_login text;
