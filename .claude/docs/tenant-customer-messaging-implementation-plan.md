# Tenant–Customer Messaging — Implementation Plan

Feature: Two-way communication between a tenant and its customers, tied to the Customer
Profile, reachable from both the admin app (desktop or mobile) and a no-login customer-facing
portal page. Supports SMS and email as notification channels today, with WhatsApp designed in
as a future addition rather than bolted on later.

---

## 1. Core architectural decision: the "doorbell" pattern

The conversation itself lives in **exactly one place**: a single thread per customer,
accessible from the admin app (Customer Profile → Conversation tab) and from a no-login
customer-facing portal page. SMS, email, and (later) WhatsApp are **never** the conversation
itself — each is purely a *notification* that something new exists in that one thread, carrying
a link back to it.

This is a deliberate choice over true two-way SMS/email/WhatsApp (where a customer's reply via
each channel would need to be parsed and merged into the thread), for three independent
reasons surfaced during design:

1. **Reach without reply-routing ambiguity.** Twilio is on a single shared account/number
   across all tenants. If two different tenants both have the same phone number as a customer
   (plausible in a smaller market), a raw inbound SMS reply has no reliable way to know which
   tenant/conversation it belongs to. A reply on the portal page is unambiguous — it's tied to
   the specific link the customer was given.
2. **No inbound-channel engineering.** Parsing inbound email replies (quoted-text noise,
   threading via Message-ID/References headers, spoofing/security concerns) and inbound SMS
   webhooks is real, ongoing engineering. None of it is needed if the customer always replies
   on the portal.
3. **Channel-agnostic for free.** Because every channel's only job is "deliver a link to the
   same thread," adding a new channel (WhatsApp later) never touches the conversation/threading
   logic — it's purely a new notifier implementation.

---

## 2. Link mechanism: extend `customer_links`, don't invent a new one

Reuse the existing `customer_links` table (already covers order, booking, and info-fill links
under one `type` enum, 10-char random ID, 30-day expiry, reusable). Add a new value:

```sql
-- Extend the existing type enum/check constraint on customer_links
-- (exact syntax depends on whether `type` is a CHECK constraint or a Postgres ENUM type —
-- confirm which, then add 'message' alongside the existing order|booking|info values)
```

One link per `(tenant_id, customer_id, type='message')`, same 30-day expiry/reuse behavior as
the other types. Regenerated on next use if expired. This deliberately does **not** touch the
employee-token system (different identity entirely — employees, not customers) or the
order-payment-link system (different purpose and expiry — single Stripe transaction, 24h).

---

## 3. Database changes

```sql
-- The conversation thread itself. One row per message, regardless of which channel
-- (if any) was used to notify the customer about it.
CREATE TABLE customer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  sent_by_user_id UUID REFERENCES users(id),  -- NULL for inbound (customer-authored) messages
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ  -- when the recipient side (admin, for inbound) viewed it
);

CREATE INDEX idx_customer_messages_customer ON customer_messages (tenant_id, customer_id, created_at);

-- Tracks each individual notification attempt for an outbound message.
-- Separate from customer_messages because one message can go out on multiple
-- channels at once (tenant toggled both email + SMS), and each needs its own
-- delivery status.
CREATE TABLE customer_message_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES customer_messages(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Notifier abstraction

```
notify(tenant, customer, message, channels: ['sms', 'email'])
```

- `channels` is **explicitly chosen by the tenant at send time** (see §6) — not automatically
  inferred from available contact info, though available contact info determines the *default*
  toggle state.
- Each channel implementation (`SmsNotifier`, `EmailNotifier`, future `WhatsAppNotifier`) takes
  the customer's contact info, the tenant's name, and the `customer_links` magic-link URL, sends
  the notification, and writes a row to `customer_message_notifications`.
- **Message content must name the tenant explicitly** — e.g. *"[Tenant Name]: You have a new
  message — view it here → [link]"* — since the Twilio number is shared across all tenants, so
  the phone number itself gives the customer no indication of which business is messaging them.
  Same logic applies to the email "from" display name.

### Channel status today

| Channel | Vendor | Status |
|---|---|---|
| SMS | Twilio (shared account/number, already used for reminders) | **Blocked — no approved 10DLC campaign yet.** One-time platform-level approval (not per-tenant, since the account is shared), but currently pending. |
| Email | Resend (already used on the marketing-site Netlify project, not yet wired into the app project) | Needs new API key + sender setup in the app project; vendor/pattern already known, low integration risk. Confirm whether `app.biznizoptimizer.com` needs its own DNS (SPF/DKIM) verification or can ride on existing root-domain records. |
| WhatsApp | Twilio (same account, separate Business API approval) | **Out of scope for v1.** Architecture already accommodates it as a third notifier when ready. |

### Edge case
A customer with neither phone nor email on file cannot be notified through any channel. The
message still gets created in the thread; it simply waits until the tenant follows up manually
or contact info is added.

---

## 5. Tenant channel choice (at send time, not a settings page)

Per-message channel toggles next to the composer/Send button on the admin side:

- Two small toggle icons (envelope / phone), pre-checked by default for whichever channels the
  customer has contact info for **and** which are platform-enabled (SMS toggle greyed out until
  the Twilio campaign is approved; email toggle live once Resend is wired in).
- Tenant can flip either on/off before sending — e.g. a tenant who knows a particular customer
  never checks email can uncheck it even though it's available.
- No "remember my last choice per customer" persistence in v1 — flagged as a reasonable v2
  convenience, not required now.

---

## 6. UI locations

**Admin side** — new **Conversation** tab/section on the Customer Profile page:
- Full thread view (inbound and outbound messages, chronological).
- Composer: text box + channel toggles (§5) + Send button.
- Sending is a server-side action (button click → Netlify function → Twilio/Resend API) — the
  tenant's own device (desktop or mobile) is irrelevant to whether SMS/email can be sent; only
  the *customer's* receiving habits motivated having both channels in the first place.

**Customer side** — existing no-login portal pattern, new page reachable via the
`customer_links` (`type='message'`) magic link:
- Thread view + a simple message box + Send.
- No channel toggles here — nothing for the customer to choose; they're already on the thread.

---

## 7. Tenant-side notification of new customer replies

**Reuse the existing alert system as-is** — the green top-left indicator already used for new
orders, new bookings, messages from SuperAdmin/Bizniz Optimizer, and customer info submitted via
the external info-fill link. A new inbound `customer_messages` row should fire the same
alert-creation logic those other events already use, rather than building a separate
notification mechanism for this feature.

**🔲 OPEN — needs confirmation during implementation:** the exact table/trigger point for the
existing alert system (e.g. an `alerts` table, a flag column, a real-time push mechanism) isn't
in this plan — find and hook into the existing implementation rather than guessing its shape.

---

## 8. Out of scope for v1

- True two-way SMS/email/WhatsApp (inbound parsing/threading) — deliberately avoided; see §1.
- WhatsApp Business API channel — architecture supports adding it later; not built now.
- Per-customer remembered channel preference — nice-to-have, not required.
- 10DLC campaign registration process itself — external Twilio/carrier dependency, not app code.

---

## 9. Open items before/while building

1. **Twilio 10DLC campaign approval status** — SMS channel cannot go live until this clears.
   Track separately; doesn't block building the portal/email side of this feature.
2. **Resend setup in the app Netlify project** — new API key, confirm sender domain
   verification requirements for `app.biznizoptimizer.com`.
3. **Existing alert system's exact mechanism** (§7) — confirm table/trigger before wiring in
   the new inbound-message case.
4. **`customer_links.type` column type** — confirm whether it's a Postgres ENUM or a CHECK
   constraint, since the migration syntax to add `'message'` differs between the two.