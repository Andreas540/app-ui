# Customer Data Import — Implementation Plan

Feature: Admin-facing bulk customer import from Excel (.xlsx) or CSV, for Bizniz Optimizer's
multi-tenant customer table. Designed for the common case (tenant onboarding, one-time bulk
load) but handles arbitrary real-world spreadsheets via smart column detection, not just an
exact-template match.

---

## 1. Goals & constraints (from design discussion)

- Tenants will mostly use this **once, at onboarding** — not a recurring monthly task.
- Tenants come from many industries; their spreadsheets will have **different column names,
  different languages, and different subsets of fields**. The app must adapt to the file, not
  force the tenant into a rigid template.
- Re-imports (e.g. after fixing errors) should **update existing customers**, not create
  duplicates.
- Some columns the app needs (`customer_type`, `shipping_cost`) are **app-specific concepts**,
  not values a customer's own data would naturally contain — so they're optional on import,
  with sensible defaults.
- `sms_consent` must **never** be settable via import — consent has to come from an actual
  opt-in action, not a spreadsheet cell.
- `partner_id` (FK to `partners`) is **out of scope for v1** — requires a name→id resolution
  step that adds real complexity for a feature that's mostly used once. Admins can assign
  partners manually after import.

---

## 2. Current `customers` table (confirmed)

| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| tenant_id | uuid | NO |
| name | text | NO |
| created_at | timestamptz | NO |
| shipping_cost | numeric | NO |
| sms_consent | boolean | NO |
| customer_type | text | yes |
| phone | text | yes |
| address1 / address2 | text | yes |
| city / state / postal_code / country | text | yes |
| company_name | text | yes |
| email | varchar | yes |
| partner_id | uuid | yes |

No `custom_fields` column exists yet — this is a net-new addition (see §3).

---

## 3. Database changes

```sql
-- Add JSONB escape hatch for tenant-specific fields not in the fixed schema
ALTER TABLE customers
  ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Registry of custom fields a tenant has actually used, so the UI can render
-- custom_fields with proper labels instead of raw JSON keys (e.g. on EditCustomer.tsx)
CREATE TABLE tenant_custom_field_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  field_key TEXT NOT NULL,       -- e.g. "membership_tier"
  label TEXT NOT NULL,           -- e.g. "Membership Tier" (admin-editable display label)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, field_key)
);

-- Recommended indexes for the dedup lookup (see §6)
CREATE INDEX idx_customers_tenant_email ON customers (tenant_id, lower(email));
CREATE INDEX idx_customers_tenant_phone ON customers (tenant_id, phone);
```

---

## 4. Field mapping reference

| Field | Required? | Default if missing/unmapped | Importable from file? |
|---|---|---|---|
| name | **Required** | — | yes |
| email | optional | null | yes |
| phone | optional | null | yes |
| company_name | optional | null | yes |
| address1, address2 | optional | null | yes |
| city | optional | null | yes |
| state / region | optional | null | yes |
| postal_code | optional | null | yes |
| country | optional | null | yes |
| customer_type | optional | `'Direct'` | yes (normalized — see §5) |
| shipping_cost | optional | `0` | yes |
| sms_consent | n/a | unchanged / false | **never** — compliance |
| partner_id | n/a | unchanged | **out of scope v1** |
| (anything else) | n/a | — | goes into `custom_fields` JSONB |

`customer_type` and `shipping_cost` are **excluded from the downloadable template** (§7) since
they're app-managed concepts, not data a tenant's own customer records would naturally have —
but they're still mappable if a tenant's own file happens to include them.

---

## 5. Customer type normalization

Backend value is always exactly `'Partner'` or `'Direct'`. The tenant-configurable label
(e.g. "BLV", "Demo") is a **display substitution for "Direct" only** — not a third value.

**Per-row normalization logic:**
1. Trim and lowercase the cell value.
2. Compare against: `"partner"`, `"direct"`, and the tenant's configured display label for
   Direct (also lowercased).
3. Match on partner-equivalents → `'Partner'`. Match on direct-equivalents → `'Direct'`.
4. No match (blank, typo, unrelated value) → default to `'Direct'`.

**🔲 OPEN — needs confirmation before building this part:** where does the tenant's custom
"Direct" display label live? Options to check: a column on `tenants`, a JSON settings/config
column, or a value inside `tenantConfig.ts`. The lookup mechanism depends on which it is.

---

## 6. Duplicate detection / update logic

- Match priority: **email first** (if present on the row), **phone second** (if no email),
  scoped to `tenant_id`.
- Row has neither email nor phone → cannot be deduped, always inserted as new (flagged in the
  preview step so the admin understands why).
- Match found → **UPDATE** the existing customer, but only for columns that were actually
  mapped in this import — unmapped existing data on that customer is left untouched (don't
  null out fields the current file simply doesn't contain).
- No match → **INSERT** new customer with defaults applied (§4).

---

## 7. Import flow (4 steps, parsing done client-side)

1. **Upload & parse** — SheetJS (`xlsx` library) reads both `.xlsx` and `.csv` in-browser, so
   one library covers both formats. A "Download template" link is offered alongside the
   upload control, generating a blank `.xlsx` with headers in the tenant's `default_language`
   (using existing `tenants.default_language`) — covers the common case where a tenant has no
   existing list and just wants a starting point. Template excludes `customer_type` and
   `shipping_cost` (see §4).
2. **Map columns** — detected headers shown with auto-suggested mappings (§8). Unmapped
   columns get an "Add as custom field" option (editable label) or "Ignore."
3. **Preview & validate** — table of the first ~10 mapped rows. Inline errors (missing
   `name`, malformed email). Summary line: *"12 will be created, 3 will update existing
   customers, 2 skipped (no email/phone, treated as new)."*
4. **Commit** — single POST to the backend import endpoint (§9) with fully mapped, validated
   rows. Backend does the dedup lookup and insert-or-update per row.

---

## 8. Column auto-detection

Two signals combined, header match given priority when both fire:

**A. Header text match** (language-aware)
Compare each column header against per-language synonym lists. Tenant's `default_language`
(from `tenants`) determines which list to check first; fall back to checking all languages if
no match. Starting synonym set (extend over time — not exhaustive):

| Field | English | Swedish | Spanish |
|---|---|---|---|
| name | Name, Full Name, Customer Name | Namn, Kundnamn | Nombre, Nombre completo |
| email | Email, E-mail, Email Address | E-post, Epost, Mejl, Mail | Correo, Correo electrónico |
| phone | Phone, Phone Number, Mobile, Tel | Telefon, Tel, Mobil | Teléfono, Móvil, Celular |
| company_name | Company, Company Name, Business | Företag, Företagsnamn | Empresa |
| address1 | Address, Address Line 1, Street | Adress, Adress 1, Gatuadress | Dirección, Dirección 1 |
| address2 | Address Line 2, Apt, Suite | Adress 2, Lägenhet | Dirección 2 |
| city | City, Town | Stad, Ort | Ciudad |
| state | State, Region, Province | Region, Län | Estado, Provincia, Departamento |
| postal_code | Postal Code, Zip, Zip Code | Postnummer | Código Postal |
| country | Country | Land | País |
| customer_type | Customer Type, Type | Kundtyp, Typ | Tipo de Cliente, Tipo |
| shipping_cost | Shipping Cost, Shipping | Fraktkostnad, Frakt | Costo de Envío, Envío |

**B. Value-based detection** (language-agnostic fallback, used when header text doesn't match
anything — e.g. generic exports with headers like "Column 1")
- Sample ~20 non-empty values per unclaimed column.
- Email: regex match (`x@y.z` shape) on ≥70% of samples.
- Phone: ≥70% of samples are mostly digits/punctuation, length 7–16 after stripping
  non-digits.
- Postal code / state / country: lower-confidence soft signals only (pattern varies too much
  by country to be reliable alone) — used as a tiebreaker suggestion, always shown to the
  admin for confirmation, never auto-locked.

Detected mappings are **suggestions only** — the admin can override any of them in step 2
before previewing.

---

## 9. Backend: `customers-import.mjs` (new Netlify Function)

- `POST`, JWT-authenticated, `tenant_id` derived from token (never trust client-supplied
  tenant_id).
- Request body: array of already-mapped/validated row objects + any new custom field
  definitions introduced during mapping.
- Per row: apply customer_type normalization (§5) → apply shipping_cost default → dedup
  lookup (§6) → insert or partial update.
- New custom field labels get upserted into `tenant_custom_field_defs`.
- Process in batches (e.g. chunks of ~200 rows) inside per-batch transactions, to avoid
  serverless function timeout on larger files.
- Response: `{ created: N, updated: N, errors: [{ row, message }] }`.

---

## 10. Out of scope for v1

- `partner_id` resolution from a "Partner" name column (requires name→id lookup + no-match
  handling — candidate for v2).
- `sms_consent` import (compliance — must come from real opt-in, never a file).
- Saved/reusable column-mapping templates per tenant (not worth the complexity given imports
  are mostly one-time).

---

## 11. Open questions before/while building

1. **Where is the tenant's custom "Direct" display label stored?** (§5) — DB column, JSON
   settings, or `tenantConfig.ts`. Needed for customer_type normalization.
2. Confirm max expected row count for real-world files, to validate the batch-size choice in §9.
3. Confirm whether a row that fails validation should **block the whole import** or be
   skipped with the rest proceeding (current assumption: skip and report, matching the
   "12 created / 3 updated / 2 skipped" summary pattern in §7).