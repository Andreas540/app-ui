-- Sprint 1: Booking Module Schema
-- Run this migration against the live database.
-- Audit note: tenants table has stripe_customer_id only — no subscription columns conflict.

-- ─── Extend existing tables ──────────────────────────────────────────────────

-- customers: add SMS consent columns if not already present
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;

-- ─── New linking table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  external_provider text NOT NULL,
  external_customer_id text NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_provider, external_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_customer_links_tenant ON booking_customer_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_customer_links_customer ON booking_customer_links(customer_id);

-- ─── Net-new tables ───────────────────────────────────────────────────────────

-- 7.1 Provider connections
CREATE TABLE IF NOT EXISTS provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  connection_status text NOT NULL DEFAULT 'pending',
  external_account_id text,
  external_account_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  onboarding_completed_at timestamptz,
  payments_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  currency text,
  country text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_connections_tenant ON provider_connections(tenant_id);

-- 7.2 Services
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  external_provider text,
  external_service_id text,
  name text NOT NULL,
  service_type text NOT NULL,
  description text,
  duration_minutes int NOT NULL,
  price_amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  capacity int,
  deposit_type text,
  deposit_value numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);

-- 7.3 Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider_connection_id uuid REFERENCES provider_connections(id),
  external_provider text,
  external_booking_id text,
  external_status text,
  customer_id uuid REFERENCES customers(id),
  service_id uuid REFERENCES services(id),
  assigned_user_id uuid,
  assigned_staff_name text,
  booking_status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'unpaid',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text,
  location_name text,
  participant_count int NOT NULL DEFAULT 1,
  total_amount numeric(12,2),
  currency text,
  notes text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON bookings(tenant_id, start_at);

-- 7.4 Booking participants
CREATE TABLE IF NOT EXISTS booking_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  booking_id uuid REFERENCES bookings(id),
  customer_id uuid REFERENCES customers(id),
  role text NOT NULL DEFAULT 'participant',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_participants_booking ON booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_participants_tenant ON booking_participants(tenant_id);

-- 7.5 Payment obligations
CREATE TABLE IF NOT EXISTS payment_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  booking_id uuid REFERENCES bookings(id),
  obligation_type text NOT NULL,
  due_amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  due_at timestamptz,
  obligation_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_booking ON payment_obligations(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_tenant ON payment_obligations(tenant_id);

-- 7.6 Payment transactions
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  booking_id uuid REFERENCES bookings(id),
  obligation_id uuid REFERENCES payment_obligations(id),
  external_provider text,
  external_payment_id text,
  transaction_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  transaction_status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking ON payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant ON payment_transactions(tenant_id);

-- 7.7 Reminder rules
CREATE TABLE IF NOT EXISTS reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_id uuid REFERENCES services(id),
  rule_name text NOT NULL,
  trigger_event text NOT NULL,
  minutes_offset int NOT NULL,
  channel text NOT NULL,
  template_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminder_rules_tenant ON reminder_rules(tenant_id);

-- 7.8 Message templates
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  template_key text NOT NULL,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_templates_tenant ON message_templates(tenant_id);

-- 7.9 Message jobs
CREATE TABLE IF NOT EXISTS message_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  booking_id uuid REFERENCES bookings(id),
  customer_id uuid REFERENCES customers(id),
  channel text NOT NULL,
  template_key text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  billable boolean NOT NULL DEFAULT false,
  stripe_reported boolean NOT NULL DEFAULT false,
  provider_message_id text,
  provider_name text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_jobs_tenant ON message_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_jobs_scheduled ON message_jobs(status, scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_message_jobs_stripe ON message_jobs(tenant_id, billable, stripe_reported) WHERE billable = true AND stripe_reported = false;

-- 7.10 Webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  provider text NOT NULL,
  provider_connection_id uuid REFERENCES provider_connections(id),
  event_type text NOT NULL,
  external_event_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant ON webhook_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON webhook_events(processed, created_at) WHERE processed = false;

-- 7.11 Sync runs
CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider_connection_id uuid REFERENCES provider_connections(id),
  sync_type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  records_processed int NOT NULL DEFAULT 0,
  error_message text
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant ON sync_runs(tenant_id);

-- 7.12 Tenant billing settings
-- Note: tenants table has stripe_customer_id only — subscription/SMS columns are net-new here.
CREATE TABLE IF NOT EXISTS tenant_billing_settings (
  tenant_id uuid PRIMARY KEY,
  stripe_subscription_id text,
  stripe_sms_subscription_item_id text,
  sms_price_per_unit numeric(12,4) NOT NULL DEFAULT 0.0200,
  sms_monthly_cap_amount numeric(12,2) NOT NULL DEFAULT 25.00,
  booking_addon_enabled boolean NOT NULL DEFAULT false,
  booking_addon_price numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7.13 Usage snapshots monthly
CREATE TABLE IF NOT EXISTS usage_snapshots_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sms_billable_count int NOT NULL DEFAULT 0,
  sms_billed_amount numeric(12,2) NOT NULL DEFAULT 0,
  stripe_invoice_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_tenant ON usage_snapshots_monthly(tenant_id);
