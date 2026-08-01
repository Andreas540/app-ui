# Item-Level Inventory — Layer 2: Extended Coverage

Part of the **Item-Level Inventory** family (L1 Units Foundation → **L2 Extended Coverage** → L3 Service History → L4 Customer Ledger → …). L1 (units, promotion, stock helper) is built. This is **L2**, and it establishes the **generic unit-attachment pattern** that all future item-specific records reuse.

## The generic pattern (the real point of L2)
The **unit is the anchor.** Anything item-specific — extended coverage now, service history next, notes, or whatever a future tenant needs — is an **attachment** hanging off a `inventory_units` row. Two independent dimensions define every attachment:

1. **Type** — coverage / service / note / … Each is its own typed table (own fields, own constraints), all following one repeatable pattern (keyed to a unit, RLS, snapshot discipline, `ON DELETE RESTRICT` on the unit). Not a polymorphic JSON bucket.
2. **Sold or not** — an **independent** capability, not tied to type. Any attachment *may* carry a nullable link to the order line that sold it (revenue/provenance). Coverage is always sold; a note never is; a service can be either (paid repair vs goodwill log). Sellability lives on the **instance** (link filled or null), not the type.

Attaching anything item-specific **promotes** the item to a unit if it isn't one already (L1 promotion). Individuation is triggered by having something a sibling doesn't.

**Base warranty is NOT an attachment.** A warranty that comes with the product applies to all quantity and needs no unit — it's a **product attribute** (fields on the product), carried by the order line + delivery date, like a receipt. Only *extra* item-specific things individuate. L2 does not model base warranty beyond optional product fields.

## What L2 builds
**Extended Coverage** — the first attachment type, and the first *sellable* one:
- A **coverage product** (sellable: price, cost, revenue, profit via the existing order flow).
- Sold as an **order line**, then **bound to the specific covered unit** from the unit panel at/after delivery.
- A **coverage attachment** on that unit: links the covered unit, the order line that sold it, and snapshotted terms (dates, what's covered).

## Confirmed decisions
- **Term:** "Extended Coverage" (not "warranty").
- **Coverage is a product** with cost/price; its sale flows through existing order/revenue/profit logic unchanged.
- **Bind sale → unit from the unit panel** at/after delivery (simple). Order creation is untouched; no unit link required at order time.
- **Attachment carries an optional order-line link** — the generic sellable capability, reusable by any future attachment type (so L3 service can be sold or unsold for free).
- **Dates:** start auto-suggests from the covered unit's delivery date, editable; end = start + duration.
- **Status (active/expired) derived** from today vs end date — never stored.
- **Snapshot** terms onto the attachment at bind time (later edits to the coverage product don't rewrite issued coverage).
- **Multiple coverages per unit** allowed.
- **Base warranty** = optional product attribute only (out of L2's attachment model).

### Implementation decisions (from review — apply these)
- **Coverage product is `category = 'product'` + a new `product_kind`** column (`CHECK IN ('standard','coverage')`, default `'standard'`). Do **not** add a `category = 'coverage'` value — that would force auditing every existing `category` filter. `product_kind` is far less invasive (no ripple through the category CHECK and its many filters) but **not literally invisible**: because coverage is `category = 'product'`, it must be explicitly **filtered out of physical-stock and product-list queries** where it doesn't belong, while remaining **visible in the order picker** (coverage is sellable). Concretely:
  - **Hide coverage** (`AND (product_kind IS NULL OR product_kind = 'standard')`): `warehouse-inventory.mjs`, `supply-chain-overview.mjs`, the standard product list (`product.mjs` GET and the `products` sub-tab). Coverage is not stock — it must not appear as a phantom zero-stock row.
  - **Keep coverage visible:** the order picker (`bootstrap.mjs`) — so it can be sold.
  - Coverage products are managed in their own coverage area, not the standard product list.
- **Coverage attributes = 4 nullable columns on `products`** (`coverage_duration_days`, `coverage_ref`, `coverage_issuer_type`, `coverage_issuer_name`), consistent with how L1 put `unit_tracking`/`sku`/`variant` on `products`. No side table.
- **One coverage line may bind to multiple units** (e.g. a family plan over 3 phones) — no unique constraint on `unit_coverage.order_item_id`. The bind picker keeps showing a line after it's bound, annotated with a **count of units already bound** to it, for context.
- **Bind picker scope = the covered unit's customer.** Coverage follows the chain coverage → product → customer, so the picker defaults to coverage order lines belonging to the **same customer** as the covered unit (reachable via `inventory_units.order_item_id → orders → customer`), with a **tenant-wide fallback** toggle for edge cases (coverage bought separately, transferred item). Same-customer lines shown first.

## Step 0 — Investigate and report first
1. Confirm `inventory_units` (L1): `id` (bigint), `product_id`, `order_item_id` (uuid), `listing_status`, promotion helper, and the delivery flow per tracking mode (`serialized_intake` flips unit→Sold via trigger; `on_promote` posts 'D' and needs app-layer promotion). Report.
2. Confirm the `products` model can take a `product_kind` column (coverage vs standard) and 4 nullable coverage columns, and that a `category = 'product'` row flows onto a customer order line and through revenue/profit normally. Enumerate the queries that select `category = 'product'` (at least `warehouse-inventory.mjs`, `supply-chain-overview.mjs`, `product.mjs` GET, `bootstrap.mjs`) so coverage can be hidden from stock/product-list queries and kept in the order picker.
3. Confirm the unit panel in `Warehouse.tsx` (L1) is where bind/attach UI will live.
4. Confirm the RLS pattern on `inventory_units` so L2 tables match it.
5. Confirm `orders.delivered_at` for date defaulting.

## Data model

### Coverage product
A `products` row with `category = 'product'` and `product_kind = 'coverage'` (per decision above), so it sells through the existing order/revenue flow unchanged. Coverage attributes as 4 nullable columns on `products`:
- `coverage_duration_days INT` — auto-suggests end date.
- `coverage_ref TEXT` — reference to the standardized coverage document (name / URL / text).
- `coverage_issuer_type TEXT CHECK (... IN ('manufacturer','shop','third_party'))`, `coverage_issuer_name TEXT`.

### Coverage attachment (the unit-attachment instance)
```sql
CREATE TABLE unit_coverage (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      ...     NOT NULL,
  unit_id        BIGINT  NOT NULL REFERENCES inventory_units(id) ON DELETE RESTRICT,
  order_item_id  UUID    NULL REFERENCES order_items(id) ON DELETE SET NULL,  -- the sale (generic sellable link); null if added manually/unsold
  coverage_product_id ... NULL,          -- which coverage product was sold (provenance); nullable for ad-hoc
  name           TEXT    NOT NULL,        -- snapshot
  issuer_type    TEXT    NOT NULL DEFAULT 'shop',   -- snapshot
  issuer_name    TEXT,                    -- snapshot
  coverage_ref   TEXT,                    -- snapshot
  start_date     DATE    NOT NULL,
  end_date       DATE    NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- **`order_item_id`** is the generic **sold link** — present for coverage (always sold), reusable by future sellable attachments. `ON DELETE SET NULL` (snapshot preserves terms).
- **`unit_id` `ON DELETE RESTRICT`** — consistent with L1; a unit with attachments can't be silently demoted.
- **RLS** on this table, matching `inventory_units`.
- Derived status computed in query/UI; multiple rows per unit allowed.

## Behavior
- **Selling coverage:** coverage product goes on an order line → revenue/profit via existing flow. No unit link needed at order time.
- **Binding to a unit:** from the covered item's unit panel (at/after delivery), the user picks which coverage line applies to this unit → creates a `unit_coverage` row: `order_item_id` = the coverage line, snapshots terms, `start = covered unit's delivered_at` (fallback order_date, then today), `end = start + duration`. **Note on "promote if needed":** binding starts from the unit panel, so a unit already exists — bind does not *create* a unit in V1. For `on_promote`/warranty products the flow is: the sold item is first made a unit (added from Warehouse), then coverage is bound from its panel. "Promote if needed" therefore means at most a status transition, not unit creation via bind.
- **Manual/ad-hoc coverage:** can be added to a unit with no order line (`order_item_id` NULL) — e.g. recording externally-purchased coverage.
- **Editable** dates/name per attachment; **snapshot** means later coverage-product edits don't change issued rows.
- **Lookup** by unit or serial → list coverages with issuer + derived active/expired.

## Frontend
- **Admin → product settings:** create/manage **coverage products** (price, cost, duration, issuer, coverage_ref) — a coverage entry in the product settings area (alongside products/recipes).
- **Unit panel (Warehouse.tsx):** show a unit's coverages (name, issuer, dates, active/expired badge, coverage_ref link-if-http else text); **bind** an unbound coverage order line to this unit; add ad-hoc coverage; edit/remove. The bind picker lists coverage order lines (each annotated with how many units are already bound to it); scoping per the "bind picker scope" decision below.
- **Order flow:** unchanged — coverage is just a product line. (Binding happens later in the unit panel.)
- i18n EN/SV/ES: Extended coverage, Coverage product, Issuer, Covered item, Bind to item, Start/End, Active/Expired. SV: Utökat skydd, Skyddsprodukt, Utfärdare, Skyddad enhet, Koppla till enhet, Giltig/Utgången. ES: Cobertura extendida, Producto de cobertura, Emisor, Artículo cubierto, Vincular al artículo, Vigente/Vencida.

## QA
- [ ] Create a coverage product (price+cost) → selling it on an order adds to revenue/profit like any product
- [ ] Bind a sold coverage line to a specific unit from the panel → `unit_coverage` row created, terms snapshotted, dates from unit's delivered_at, item promoted if needed
- [ ] Multiple coverages on one unit coexist
- [ ] Ad-hoc coverage (no order line, `order_item_id` NULL) can be added to a unit
- [ ] Edit coverage product later → previously bound coverages unchanged (snapshot holds)
- [ ] Derived status flips expired the day after `end_date`; nothing stored
- [ ] Deleting a covered coverage-product order line sets `order_item_id` NULL, coverage row survives with snapshot
- [ ] Deleting a unit with coverage is blocked (RESTRICT) with a clear message
- [ ] `coverage_ref` renders as link if starts with http, else text
- [ ] Lookup by serial returns the unit's coverages with issuer
- [ ] Coverage product does NOT appear in Warehouse inventory, Supply Chain Overview, or the standard product list; DOES appear in the order picker
- [ ] Bind picker defaults to the covered unit's customer's coverage lines; tenant-wide fallback available; bound lines show a unit count
- [ ] EN/SV/ES render

## Out of scope (future — reuse this pattern)
- **L3 Service History** — next attachment type; timestamped notes, using the *same* pattern, with the optional sold-link when a service is a paid repair.
- **Base warranty** modeled beyond simple product fields.
- **Binding coverage at order-creation time** (parent/child order lines) — deferred; panel-binding is v1.
- **Uploaded coverage documents** (files) — reference only in v1.
- **Transfer to a non-customer holder**, **expiry notifications** — future.
