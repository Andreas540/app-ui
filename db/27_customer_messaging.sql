-- 27_customer_messaging.sql
-- Tenant–customer two-way messaging (doorbell pattern).
-- Notifications (SMS/email) are tracked separately; the thread itself is channel-agnostic.

-- 1. Extend customer_links to support message-portal links
ALTER TABLE customer_links DROP CONSTRAINT IF EXISTS customer_links_type_check;
ALTER TABLE customer_links ADD CONSTRAINT customer_links_type_check
  CHECK (type IN ('order', 'booking', 'info', 'message'));

-- 2. The conversation thread — one row per message, direction inbound (customer) or outbound (tenant)
CREATE TABLE IF NOT EXISTS customer_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id    UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  direction      TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body           TEXT        NOT NULL,
  sent_by_user_id UUID       REFERENCES users(id),  -- NULL for inbound (customer-authored)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ            -- set when the recipient side views the message
);

CREATE INDEX IF NOT EXISTS idx_customer_messages_thread
  ON customer_messages (tenant_id, customer_id, created_at);

-- 3. Per-notification delivery record — one row per channel attempt per outbound message
CREATE TABLE IF NOT EXISTS customer_message_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID        NOT NULL REFERENCES customer_messages(id) ON DELETE CASCADE,
  channel    TEXT        NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp')),
  status     TEXT        NOT NULL CHECK (status IN ('sent', 'failed')),
  error      TEXT,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
