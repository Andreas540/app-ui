-- ============================================================
-- 01_schema.sql — Complete reference schema (public schema)
-- Reflects live Neon DB state as of 2026-03-25.
-- Run 02–08 migrations on top for a full rebuild.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Core: Tenants ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT,
  business_type       TEXT DEFAULT 'general' CHECK (business_type IN ('general', 'physical_store')),
  features            JSONB DEFAULT '["dashboard","customers","partners","price-checker","orders","payments","products","invoices","inventory","supply-chain","suppliers","supplier-orders","warehouse","production","time-entry","employees","time-approval","costs","tenant-admin","settings"]',
  app_icon_192        TEXT,
  app_icon_512        TEXT,
  favicon             TEXT,
  app_name            VARCHAR(100),
  default_language    VARCHAR(10)  DEFAULT 'en',    -- ISO 639-1
  default_locale      VARCHAR(10)  DEFAULT 'en-US', -- ISO 639-1 + ISO 3166-1
  available_languages TEXT[]       DEFAULT ARRAY['en','sv','es'],
  stripe_customer_id  VARCHAR,
  default_currency    VARCHAR(10)  DEFAULT 'USD',
  default_timezone    VARCHAR(100) DEFAULT 'UTC',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Auth: Users ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) NOT NULL,
  password_hash       TEXT NOT NULL,
  name                VARCHAR(255),
  role                VARCHAR(50)  NOT NULL CHECK (role IN ('super_admin','tenant_admin','tenant_user')),
  access_level        VARCHAR(50)  CHECK (access_level IN ('admin','inventory')),
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  active              BOOLEAN DEFAULT TRUE,
  disabled            BOOLEAN DEFAULT FALSE NOT NULL,
  preferred_language  VARCHAR(10),   -- NULL = use tenant default
  preferred_locale    VARCHAR(10),   -- NULL = use tenant default
  preferred_currency  VARCHAR(10),
  preferred_timezone  VARCHAR(100),
  last_login          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tenant_users_must_have_tenant CHECK (
    (role = 'super_admin' AND tenant_id IS NULL) OR
    (role <> 'super_admin' AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS app_users (
  id          UUID PRIMARY KEY,
  email       TEXT,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  features   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_features ON tenant_memberships USING GIN (features);

CREATE TABLE IF NOT EXISTS tenant_module_quotas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  quota_limit INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES app_users(id) ON DELETE CASCADE,
  email      TEXT,
  action     TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_action ON user_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_email  ON user_activity_log(email);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_user  ON password_reset_tokens(user_id);

-- ── Core: Customers & Partners ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  address1      TEXT,
  address2      TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partners_tenant ON partners(tenant_id);

CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  customer_type TEXT DEFAULT 'BLV' CHECK (customer_type IN ('BLV','Direct','Partner')),
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  phone         TEXT,
  address1      TEXT,
  address2      TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  company_name  TEXT,
  partner_id    UUID REFERENCES partners(id),
  sms_consent   BOOLEAN NOT NULL DEFAULT FALSE,
  sms_consent_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

-- ── Core: Products ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  cost       NUMERIC(11,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

CREATE TABLE IF NOT EXISTS product_cost_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  product_id     UUID NOT NULL,
  cost           NUMERIC(11,3) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_cost_history_tenant_product_fk FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pch_product_from ON product_cost_history(product_id, effective_from DESC);

-- ── Core: Orders ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_no          INT NOT NULL,
  order_date        DATE NOT NULL,
  delivered         BOOLEAN NOT NULL DEFAULT TRUE,
  delivered_quantity INT NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  delivery_status   TEXT GENERATED ALWAYS AS (
    CASE
      WHEN delivered = TRUE        THEN 'delivered'
      WHEN delivered_quantity > 0  THEN 'partial'
      ELSE 'not_delivered'
    END
  ) STORED,
  discount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  product_cost      NUMERIC(10,2),
  shipping_cost     NUMERIC(10,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_no)
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant     ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer   ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

CREATE TABLE IF NOT EXISTS order_counters (
  tenant_id  UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_no    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tenant_order_counters (
  tenant_id     UUID PRIMARY KEY,
  last_order_no BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty           INT NOT NULL CHECK (qty > 0),
  unit_price    NUMERIC(10,2) NOT NULL,
  product_cost  NUMERIC,
  shipping_cost NUMERIC,
  cost          NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_partners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  share      NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_partners_order ON order_partners(order_id);

-- ── Core: Payments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  order_id     UUID REFERENCES orders(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant   ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date     ON payments(payment_date DESC);

CREATE TABLE IF NOT EXISTS partner_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  partner_id   UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_payments_partner ON partner_payments(partner_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_partner_payments_tenant  ON partner_payments(tenant_id);

CREATE TABLE IF NOT EXISTS partner_to_partner_debt_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  partner_payment_id UUID NOT NULL REFERENCES partner_payments(id) ON DELETE CASCADE,
  from_partner_id   UUID NOT NULL REFERENCES partners(id),
  to_partner_id     UUID NOT NULL REFERENCES partners(id),
  amount            NUMERIC(12,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_to_partner_debt_payments_partner_payment_id
  ON partner_to_partner_debt_payments(partner_payment_id);

-- ── Suppliers ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  name       TEXT NOT NULL,
  contact    TEXT,
  email      TEXT,
  phone      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders_suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  order_date  DATE NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items_suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  order_id      UUID NOT NULL REFERENCES orders_suppliers(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  qty           INT NOT NULL CHECK (qty >= 1),
  product_cost  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (product_cost >= 0),
  shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  supplier_id  UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  order_id     UUID REFERENCES orders_suppliers(id) ON DELETE SET NULL,
  amount       NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_order    ON supplier_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date     ON supplier_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant   ON supplier_payments(tenant_id);

-- ── Warehouse ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouse_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  order_id          UUID REFERENCES orders(id) ON DELETE CASCADE,
  order_supplier_id UUID REFERENCES orders_suppliers(id) ON DELETE CASCADE,
  delivered_at      DATE NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Employees & Time ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT,
  role             TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  share_token_hash TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_email        ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_active ON employees(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_employees_share_token_hash ON employees(share_token_hash) WHERE share_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id),
  session_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee ON employee_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_token    ON employee_sessions(session_token);

CREATE TABLE IF NOT EXISTS time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  hours       NUMERIC(5,2) NOT NULL,
  approved    BOOLEAN NOT NULL DEFAULT FALSE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_date   ON time_entries(tenant_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON time_entries(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_approved      ON time_entries(tenant_id, approved, work_date DESC);

CREATE TABLE IF NOT EXISTS labor_production (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  date       DATE NOT NULL,
  units      NUMERIC(10,2) NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_labor_production_tenant_date    ON labor_production(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_production_tenant_product ON labor_production(tenant_id, product_id);

CREATE TABLE IF NOT EXISTS salary_cost_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(12,2) NOT NULL,
  effective_from DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salary_cost_history_employee_id   ON salary_cost_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_cost_history_effective_from ON salary_cost_history(effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_salary_cost_history_tenant_id     ON salary_cost_history(tenant_id);

-- ── Costs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS costs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  cost_date     DATE NOT NULL,
  cost_category TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS costs_tenant_date_idx  ON costs(tenant_id, cost_date);
CREATE INDEX IF NOT EXISTS costs_cost_category_idx ON costs(cost_category);
CREATE INDEX IF NOT EXISTS costs_cost_date_idx     ON costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_costs_category      ON costs(cost_category);
CREATE INDEX IF NOT EXISTS idx_costs_cost_date     ON costs(cost_date);

CREATE TABLE IF NOT EXISTS costs_recurring (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  cost_category TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS costs_recurring_tenant_idx     ON costs_recurring(tenant_id);
CREATE INDEX IF NOT EXISTS costs_recurring_start_date_idx ON costs_recurring(start_date);
CREATE INDEX IF NOT EXISTS costs_recurring_end_date_idx   ON costs_recurring(end_date);
CREATE INDEX IF NOT EXISTS idx_recurring_start_end        ON costs_recurring(start_date, end_date);

CREATE TABLE IF NOT EXISTS shipping_cost_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  shipping_cost  NUMERIC(10,2) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sch_customer_from         ON shipping_cost_history(customer_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_cost_history_customer ON shipping_cost_history(customer_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_shipping_cost_history_tenant   ON shipping_cost_history(tenant_id);

-- ── Contact & Misc ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT,
  email      TEXT,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Booking Module (see 03_booking_module.sql for original migration) ─────────

CREATE TABLE IF NOT EXISTS provider_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  provider                TEXT NOT NULL,
  connection_status       TEXT NOT NULL DEFAULT 'pending',
  external_account_id     TEXT,
  external_account_name   TEXT,
  access_token_encrypted  TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at        TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  payments_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  currency                TEXT,
  country                 TEXT,
  last_sync_at            TIMESTAMPTZ,
  user_login              TEXT,                          -- added in 07_simplybook_user_login.sql
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_connections_tenant ON provider_connections(tenant_id);

CREATE TABLE IF NOT EXISTS services (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  external_provider  TEXT,
  external_service_id TEXT,
  name               TEXT NOT NULL,
  service_type       TEXT NOT NULL,
  description        TEXT,
  duration_minutes   INT NOT NULL,
  price_amount       NUMERIC(12,2) NOT NULL,
  currency           TEXT NOT NULL,
  capacity           INT,
  deposit_type       TEXT,
  deposit_value      NUMERIC(12,2),
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);

CREATE TABLE IF NOT EXISTS bookings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  provider_connection_id UUID REFERENCES provider_connections(id),
  external_provider    TEXT,
  external_booking_id  TEXT,
  external_status      TEXT,
  customer_id          UUID REFERENCES customers(id),
  service_id           UUID REFERENCES services(id),
  assigned_user_id     UUID,
  assigned_staff_name  TEXT,
  booking_status       TEXT NOT NULL DEFAULT 'pending',
  payment_status       TEXT NOT NULL DEFAULT 'unpaid',
  start_at             TIMESTAMPTZ NOT NULL,
  end_at               TIMESTAMPTZ NOT NULL,
  timezone             TEXT,
  location_name        TEXT,
  participant_count    INT NOT NULL DEFAULT 1,
  total_amount         NUMERIC(12,2),
  currency             TEXT,
  notes                TEXT,
  raw_payload          JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant   ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service  ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON bookings(tenant_id, start_at);

CREATE TABLE IF NOT EXISTS booking_customer_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  external_provider   TEXT NOT NULL,
  external_customer_id TEXT NOT NULL,
  raw_payload         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_provider, external_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_customer_links_tenant   ON booking_customer_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_customer_links_customer ON booking_customer_links(customer_id);

CREATE TABLE IF NOT EXISTS booking_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  booking_id  UUID REFERENCES bookings(id),
  customer_id UUID REFERENCES customers(id),
  role        TEXT NOT NULL DEFAULT 'participant',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_participants_booking ON booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_participants_tenant  ON booking_participants(tenant_id);

CREATE TABLE IF NOT EXISTS payment_obligations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  booking_id        UUID REFERENCES bookings(id),
  obligation_type   TEXT NOT NULL,
  due_amount        NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL,
  due_at            TIMESTAMPTZ,
  obligation_status TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_booking ON payment_obligations(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_obligations_tenant  ON payment_obligations(tenant_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  booking_id          UUID REFERENCES bookings(id),
  obligation_id       UUID REFERENCES payment_obligations(id),
  external_provider   TEXT,
  external_payment_id TEXT,
  transaction_type    TEXT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT NOT NULL,
  transaction_status  TEXT NOT NULL DEFAULT 'pending',
  paid_at             TIMESTAMPTZ,
  raw_payload         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking ON payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant  ON payment_transactions(tenant_id);

CREATE TABLE IF NOT EXISTS reminder_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  service_id     UUID REFERENCES services(id),
  rule_name      TEXT NOT NULL,
  trigger_event  TEXT NOT NULL,
  minutes_offset INT NOT NULL,
  channel        TEXT NOT NULL,
  template_key   TEXT NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminder_rules_tenant ON reminder_rules(tenant_id);

CREATE TABLE IF NOT EXISTS message_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  template_key TEXT NOT NULL,
  channel      TEXT NOT NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_templates_tenant ON message_templates(tenant_id);

CREATE TABLE IF NOT EXISTS message_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  booking_id          UUID REFERENCES bookings(id),
  customer_id         UUID REFERENCES customers(id),
  channel             TEXT NOT NULL,
  template_key        TEXT NOT NULL,
  scheduled_for       TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued',
  billable            BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_reported     BOOLEAN NOT NULL DEFAULT FALSE,
  provider_message_id TEXT,
  provider_name       TEXT,
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_jobs_tenant     ON message_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_jobs_scheduled  ON message_jobs(status, scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_message_jobs_stripe     ON message_jobs(tenant_id, billable, stripe_reported) WHERE billable = TRUE AND stripe_reported = FALSE;

CREATE TABLE IF NOT EXISTS webhook_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID,
  provider              TEXT NOT NULL,
  provider_connection_id UUID REFERENCES provider_connections(id),
  event_type            TEXT NOT NULL,
  external_event_id     TEXT,
  payload               JSONB NOT NULL,
  processed             BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at          TIMESTAMPTZ,
  processing_error      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant       ON webhook_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed  ON webhook_events(processed, created_at) WHERE processed = FALSE;

CREATE TABLE IF NOT EXISTS sync_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  provider_connection_id UUID REFERENCES provider_connections(id),
  sync_type             TEXT NOT NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'running',
  records_processed     INT NOT NULL DEFAULT 0,
  error_message         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant ON sync_runs(tenant_id);

-- ── Billing ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_billing_settings (
  tenant_id                        UUID PRIMARY KEY,
  stripe_subscription_id           TEXT,
  stripe_sms_subscription_item_id  TEXT,
  sms_price_per_unit               NUMERIC(12,4) NOT NULL DEFAULT 0.0200,
  sms_monthly_cap_amount           NUMERIC(12,2) NOT NULL DEFAULT 25.00,
  booking_addon_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  booking_addon_price              NUMERIC(12,2),
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_snapshots_monthly (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  sms_billable_count INT NOT NULL DEFAULT 0,
  sms_billed_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  stripe_invoice_id  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_tenant ON usage_snapshots_monthly(tenant_id);
