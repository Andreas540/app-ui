# Booking Module — Revised Build Brief
> Bizniz Optimizer · Revised from original AI-generated brief  
> Status: Pre-development architectural reference  
> Save as: `docs/booking-module-brief.md` in your repo root

---

## 1. Purpose and scope

This module enables tenants who sell bookable services (lessons, classes, sessions, appointments, clinics, or any time-based offering) to manage the business side of those bookings inside Bizniz Optimizer. The actual booking flow lives on an external platform. Our app owns the post-booking layer: client records, payment tracking, reminders, and reporting.

The first real-world use case is a tennis coach selling private lessons and group clinics. The schema and UI must be generic — "service" not "lesson", "participant" not "student" — with tenant-level labels configurable via `tenantConfig.ts` the same way `directLabel`/`directValue` work for customer types.

---

## 2. What the external provider owns

- Public booking page / widget
- Availability and scheduling engine
- Payment checkout and collection to the tenant
- Cancellation and rescheduling flows

We integrate via webhook ingestion and periodic sync. **The frontend never calls the provider directly.**

---

## 3. What our app owns

- Normalized booking and service records (our DB is source of truth)
- Client records (linked to existing customer system — see Section 5)
- Payment obligations and transaction metadata
- SMS/email reminder orchestration
- Dashboard: today's schedule, upcoming bookings, revenue, outstanding balances
- Metered SMS billing via Stripe
- All tenant isolation via `resolveAuthz()` (same as every other endpoint)

---

## 4. Module gating

This is a **module** in the existing `modules.ts` / `features.ts` system. It must be:

- Defined as an entry in `modules.ts` (e.g. `booking`)
- Gated by `tenant_module_quotas` the same way all other modules are
- Toggleable via the SuperAdmin Subscription modal
- UI-controlled via `tenantConfig.ts` flags (see Section 10)

Do not build this as a standalone feature outside the existing permission/subscription architecture.

---

## 5. Conflict — existing customers table

**The original brief proposed a new `customers` table. This conflicts with the existing customer management system.**

The existing customers table already handles:
- Multi-tenant isolation
- Customer types (`BLV`, `Direct`, and tenant-specific variants via `directValue`/`directLabel`)
- Full CRUD with tenant-scoped endpoints

**Resolution:** Do not create a parallel customers table. Instead, add booking-specific columns to the existing customers table (if not already present) and create a `booking_customer_links` table to carry provider-specific external IDs:

```sql
-- Add to existing customers table if not already present:
-- phone text  (may already exist)
-- sms_consent boolean default false
-- sms_consent_at timestamptz

-- New linking table (net-new, no conflict):
CREATE TABLE booking_customer_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid not null references customers(id),
  external_provider text not null,         -- 'simplybook', etc.
  external_customer_id text not null,
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, external_provider, external_customer_id)
);
```

When a webhook or sync delivers a customer from the provider, look up by `external_customer_id` in `booking_customer_links`. If found, use the linked `customer_id`. If not, create a new customer record in the existing table and insert a link row.

---

## 6. Conflict — Stripe / billing tables

The original brief proposes a `tenant_billing_settings` table for Stripe subscription and SMS pricing data. Before creating this table, verify what Stripe-related columns already exist on the `tenants` table (e.g. `stripe_customer_id`). The new table should not duplicate any existing columns.

Suggested approach: create `tenant_billing_settings` as a separate table keyed on `tenant_id`, but only after auditing what the `tenants` table currently holds. Columns that already exist there should not be mirrored.

---

## 7. Net-new database tables

These tables have no conflicts with existing schema and can be created as specified. All require `tenant_id` and must be scoped by `resolveAuthz()` in every backend endpoint.

### 7.1 `provider_connections`
One row per tenant-provider connection.

```sql
CREATE TABLE provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,                          -- 'simplybook'
  connection_status text not null,                 -- pending, connected, error, disconnected
  external_account_id text,
  external_account_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  onboarding_completed_at timestamptz,
  payments_enabled boolean default false,
  payouts_enabled boolean default false,
  currency text,
  country text,
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.2 `services`
Bookable offerings: private session, group class, clinic, appointment, etc.

```sql
CREATE TABLE services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  external_provider text,
  external_service_id text,
  name text not null,
  service_type text not null,                      -- private, group, clinic, other
  description text,
  duration_minutes int not null,
  price_amount numeric(12,2) not null,
  currency text not null,
  capacity int,
  deposit_type text,                               -- none, fixed, percent
  deposit_value numeric(12,2),
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.3 `bookings`
Central booking/session record.

```sql
CREATE TABLE bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider_connection_id uuid references provider_connections(id),
  external_provider text,
  external_booking_id text,
  external_status text,
  customer_id uuid references customers(id),       -- references EXISTING customers table
  service_id uuid references services(id),
  assigned_user_id uuid,                           -- soft ref to users table, no FK constraint; null if no user account exists for this staff member
  assigned_staff_name text,                        -- denormalized display name from provider raw data; always populated at sync time regardless of user account
  booking_status text not null,                    -- pending, confirmed, canceled, completed, no_show
  payment_status text not null,                    -- unpaid, deposit_paid, paid, partially_refunded, refunded
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text,
  location_name text,
  participant_count int default 1,
  total_amount numeric(12,2),
  currency text,
  notes text,
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

> **Note on `assigned_user_id` and `assigned_staff_name`:** Two columns handle the real-world range of cases. `assigned_staff_name` is always populated from the provider's raw payload at sync time, giving you something to display regardless of app setup. `assigned_user_id` is a soft reference to the `users` table with no FK constraint — populated only if a user account exists for that staff member. A solo tenant_admin who is the coach is covered (they are a user). A part-time staff member with no app login is also covered (name from payload, no user ID). Users are never created automatically to fill this field.

### 7.4 `booking_participants`
For group classes with multiple attendees.

```sql
CREATE TABLE booking_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid references bookings(id),
  customer_id uuid references customers(id),
  role text default 'participant',
  created_at timestamptz default now()
);
```

### 7.5 `payment_obligations`
What should be paid per booking.

```sql
CREATE TABLE payment_obligations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid references bookings(id),
  obligation_type text not null,                   -- booking_total, deposit, balance
  due_amount numeric(12,2) not null,
  currency text not null,
  due_at timestamptz,
  obligation_status text not null,                 -- pending, partially_paid, paid, canceled
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.6 `payment_transactions`
What actually happened (charge, refund, etc.).

```sql
CREATE TABLE payment_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid references bookings(id),
  obligation_id uuid references payment_obligations(id),
  external_provider text,
  external_payment_id text,
  transaction_type text not null,                  -- charge, deposit, balance_payment, refund
  amount numeric(12,2) not null,
  currency text not null,
  transaction_status text not null,                -- pending, succeeded, failed, refunded
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz default now()
);
```

### 7.7 `reminder_rules`
Per-tenant, optionally per-service reminder configuration.

```sql
CREATE TABLE reminder_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  service_id uuid references services(id),         -- null = applies to all services
  rule_name text not null,
  trigger_event text not null,                     -- booking_confirmed, before_start, unpaid_balance
  minutes_offset int not null,
  channel text not null,                           -- sms, email
  template_key text not null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.8 `message_templates`

```sql
CREATE TABLE message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_key text not null,
  channel text not null,
  subject text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.9 `message_jobs`
Reminder ledger and SMS billing source of truth.

```sql
CREATE TABLE message_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  booking_id uuid references bookings(id),
  customer_id uuid references customers(id),
  channel text not null,                           -- sms, email
  template_key text not null,
  scheduled_for timestamptz not null,
  status text not null,                            -- queued, sending, accepted, sent, delivered, failed, canceled
  billable boolean default false,
  stripe_reported boolean default false,
  provider_message_id text,
  provider_name text,                              -- twilio, resend, etc.
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.10 `webhook_events`
Raw inbound event log from provider.

```sql
CREATE TABLE webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  provider text not null,
  provider_connection_id uuid references provider_connections(id),
  event_type text not null,
  external_event_id text,
  payload jsonb not null,
  processed boolean default false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz default now()
);
```

### 7.11 `sync_runs`

```sql
CREATE TABLE sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider_connection_id uuid references provider_connections(id),
  sync_type text not null,                         -- initial_import, incremental, reconciliation
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text not null,                            -- running, succeeded, failed
  records_processed int default 0,
  error_message text
);
```

### 7.12 `tenant_billing_settings`
**Audit `tenants` table before creating. Do not duplicate existing Stripe columns.**

```sql
CREATE TABLE tenant_billing_settings (
  tenant_id uuid primary key,
  stripe_subscription_id text,
  stripe_sms_subscription_item_id text,
  sms_price_per_unit numeric(12,4) default 0.0200,
  sms_monthly_cap_amount numeric(12,2) default 25.00,
  booking_addon_enabled boolean default false,
  booking_addon_price numeric(12,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.13 `usage_snapshots_monthly`

```sql
CREATE TABLE usage_snapshots_monthly (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  period_start date not null,
  period_end date not null,
  sms_billable_count int not null default 0,
  sms_billed_amount numeric(12,2) not null default 0,
  stripe_invoice_id text,
  created_at timestamptz default now()
);
```

---

## 8. Status and enum reference

| Field | Values |
|---|---|
| `booking_status` | `pending`, `confirmed`, `canceled`, `completed`, `no_show` |
| `payment_status` | `unpaid`, `deposit_paid`, `paid`, `partially_refunded`, `refunded` |
| `message_jobs.status` | `queued`, `sending`, `accepted`, `sent`, `delivered`, `failed`, `canceled` |
| `connection_status` | `pending`, `connected`, `error`, `disconnected` |
| `obligation_status` | `pending`, `partially_paid`, `paid`, `canceled` |
| `transaction_status` | `pending`, `succeeded`, `failed`, `refunded` |
| `sync_type` | `initial_import`, `incremental`, `reconciliation` |
| `sync_runs.status` | `running`, `succeeded`, `failed` |

---

## 9. Backend flows

All Netlify functions must use `resolveAuthz()` for tenant isolation. No exceptions. Follow the same pattern as all existing endpoints.

### Flow A — Tenant connects provider
1. Tenant clicks Connect in UI
2. Redirect to provider auth / onboarding
3. Callback stores `provider_connections` row with `status = connected`
4. Trigger initial sync (Flow B)

### Flow B — Initial sync
1. Pull services → upsert `services`
2. Pull customers → match or create in existing `customers` table + insert `booking_customer_links`
3. Pull upcoming bookings → upsert `bookings`
4. Pull payment data if exposed → upsert `payment_obligations` / `payment_transactions`
5. Save `external_id` and `raw_payload` on every record
6. Log in `sync_runs`

### Flow C — Webhook ingestion
1. Receive provider webhook in Netlify function
2. Verify signature if supported
3. Store raw row in `webhook_events`
4. Upsert normalized entities
5. Reschedule `message_jobs` if booking changed or canceled

### Flow D — Reminder scheduling
On booking create/update:
1. Find applicable `reminder_rules` for tenant + service
2. Generate `message_jobs`
3. De-duplicate by `(booking_id, rule, scheduled_for)`
4. Cancel outdated jobs if booking time changed or booking canceled

### Flow E — SMS sending
1. Scheduled function finds due `queued` SMS jobs
2. Validate phone and consent (`sms_consent = true` on customer)
3. Send via Twilio
4. Mark `billable = true`, `status = accepted`, save `provider_message_id`
5. Enqueue Stripe usage sync

### Flow F — Stripe usage reporting
1. Periodic job finds `billable = true` and `stripe_reported = false`
2. Report usage to Stripe metered subscription item
3. Mark `stripe_reported = true` on success
4. Retry failures safely

### Flow G — Reconciliation (nightly)
1. Compare provider upcoming bookings vs our DB
2. Compare billable SMS count vs Stripe reported count
3. Flag mismatches for review

---

## 10. tenantConfig.ts flags

Add the following flags to the `tenantConfig.ts` system so UI behavior is DB-controlled, not hardcoded:

| Flag | Type | Purpose |
|---|---|---|
| `showBookingModule` | `boolean` | Master toggle — show/hide booking nav and pages |
| `serviceTypeLabel` | `string` | Label for service type (e.g. "Lesson", "Session", "Appointment") |
| `bookingProviderName` | `string` | Display name of connected provider (e.g. "SimplyBook") |
| `smsRemindersEnabled` | `boolean` | Show/hide reminder settings UI |
| `showBookingParticipants` | `boolean` | Show participant management for group bookings |

---

## 11. Netlify functions plan

All functions follow existing ESM `.mjs` conventions and use `resolveAuthz()`.

**Provider integration**
- `connect-booking-provider.mjs`
- `booking-provider-callback.mjs`
- `provider-webhook-simplybook.mjs`
- `sync-provider-services.mjs`
- `sync-provider-customers.mjs`
- `sync-provider-bookings.mjs`
- `reconcile-provider-data.mjs`

**SMS and reminders**
- `scheduled-process-reminders.mjs`
- `send-sms.mjs`
- `twilio-status-webhook.mjs`
- `sync-stripe-sms-usage.mjs`

**Billing**
- `create-booking-addon.mjs`
- `add-sms-metered-item.mjs`

**App API**
- `get-booking-dashboard.mjs`
- `get-bookings.mjs`
- `get-booking-detail.mjs`
- `get-booking-customers.mjs`
- `get-payments-summary.mjs`
- `get-reminder-settings.mjs`
- `save-reminder-settings.mjs`
- `get-sms-usage.mjs`

---

## 12. Frontend pages and components

Pages slot into the existing React/TypeScript routing structure. All gated by `showBookingModule` from `tenantConfig`.

**Pages**
- `BookingIntegrationPage` — provider connect/status
- `BookingDashboardPage` — today + upcoming schedule, revenue, balances
- `BookingsPage` — full bookings list with filters
- `BookingDetailPage` — single booking view + payments + reminders
- `BookingCustomersPage` — customers with booking history (view into existing customers, filtered by booking activity)
- `PaymentsSummaryPage` — outstanding and collected payment overview
- `RemindersPage` — rule and template management
- `SmsUsagePage` — usage + billing

**Key components**
- `IntegrationStatusCard`
- `TodayScheduleCard`
- `UpcomingBookingsTable`
- `RevenueSummaryCard`
- `OutstandingBalancesCard`
- `SmsUsageCard`
- `BookingStatusBadge`
- `PaymentStatusBadge`
- `ReminderRulesPanel`
- `ReminderTemplateEditor`
- `BookingProviderConnectButton`

---

## 13. MVP provider

**Phase 1:** SimplyBook.me only. One provider account per tenant. Tenant pays SimplyBook separately — our app does not process that payment.

**Phase 2:** Abstract provider UI so switching providers is invisible to the tenant.

---

## 14. Build sequence

### Sprint 1 — Schema
- Create all net-new tables (Section 7)
- Audit `tenants` table before creating `tenant_billing_settings`
- Add `sms_consent` / `sms_consent_at` to existing `customers` table if not present
- Create `booking_customer_links`
- Add `booking` module to `modules.ts` and `tenant_module_quotas`
- Add `tenantConfig.ts` flags (Section 10)

### Sprint 2 — Provider connection
- Connect provider UI and callback endpoint
- Persist `provider_connections` row
- Manual sync trigger in UI

### Sprint 3 — Import and dashboard
- Sync services, customers, bookings from provider
- Build dashboard summary endpoints and UI
- Build bookings list and detail views

### Sprint 4 — Reminders
- Reminder rules UI
- Message job generation
- SMS send via Twilio
- Twilio status callback

### Sprint 5 — Stripe metered billing
- SMS metered item on tenant subscription
- Usage reporting to Stripe
- Billing/usage screen with monthly cap

### Sprint 6 — Resilience
- Webhook raw log review UI (SuperAdmin)
- Reconciliation jobs
- Retry logic
- Cancellation/reschedule job cleanup

---

## 15. Decisions deferred to implementation

- Whether `booking_customers` is a filtered view of existing customers or gets its own page
- Exact Stripe metered billing item configuration
- Email reminder provider (brief mentions Resend as `provider_name` — confirm this is the intended email provider)