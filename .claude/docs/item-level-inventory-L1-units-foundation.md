# Item-Level Inventory — Layer 1: Units Foundation

## Feature family & naming (so we can resume at any time without confusion)

**Item-Level Inventory** is the Mode B unit-tracking capability: individual physical copies of a product tracked as named rows, alongside the existing anonymous quantity model. It is built in layers, each its own deliverable:

- **L1 — Units Foundation** *(this doc)*: the unit table, promotion, per-product tracking config, and the central stock-resolution helper. The foundation everything else hangs off.
- **L2 — Warranty Records** *(future)*: structured warranty (dates, coverage) attached to a unit.
- **L3 — Service History** *(future)*: timestamped free-form service notes attached to a unit.
- **L4 — Customer Ledger** *(future)*: aggregation view — a customer's owned units + their warranties + service histories + customer-level notes (notes stay with the customer, do not travel on resale).

This doc is **L1 only**. L2–L4 are named in "Future layers" with the seams they attach to, but are out of scope here.

---

## Goal (L1)
Introduce **named units** (individual tracked copies) that coexist with the existing **anonymous quantity** inventory, so the same product/SKU can hold both a countable quantity *and* individually-identified units — without two competing stock engines and without drift. The invariant that matters (your words): **keep the total on-hand correct, and the quantity of each inventory row correct.**

### Resolved decisions (from code-base review — apply these)
1. **Serial uniqueness is product-scoped:** unique index `(tenant_id, product_id, serial_number)` where serial IS NOT NULL. ("unit #001" may recur across different products.)
2. **Reservation = `Listed`:** claiming a unit on an order line sets it `Listed`; a unit already `Listed` or `Sold` cannot be claimed by another line. This closes the double-assignment gap with no new status.
3. **The stock helper is a Postgres function/view, not a JS helper.** Callers are inline multi-CTE SQL; only a DB-level function makes "one source of truth" real across them. Ships as a migration. (A duplicated SQL fragment is explicitly rejected — it reintroduces drift.)
4. **BOM + `serialized_intake` is OUT of scope for L1.** Production-as-intake (produce 5 → 5 unit rows) is a separate follow-up path. In L1, `serialized_intake` products are populated via receipt or manual promotion only.
5. **`Listed` is a local visual flag** — no backing listings table in L1. UX must make clear it is a local tag, not a marketplace sync.
6. **`order_item_id` is a real FK with `ON DELETE RESTRICT`** and a meaningful user-facing error when a demote/delete is blocked by an active order line.
7. **Variant reality:** `sku`/`variant` are plain-text columns on `products` (no variant table), so `inventory_units.product_id → products.id`; a variant needing per-unit tracking must be its own product row. Confirm in Step 0.

### Core principle
- **Anonymous quantity** = fungible stock, counted via the existing `warehouse_deliveries` ledger. Unchanged.
- **Named unit** = one physical copy as a row (nullable serial, condition, listing status). Created by **promotion**.
- **Promotion** = moving one item from the anonymous pool to a named row: anonymous quantity −1, insert unit row, **atomic, total conserved, no status-change event logged** (only the resulting counts matter).
- **On-hand for a product = anonymous quantity + count of in-stock named units.** One number, two contributors, resolved in **one central helper** every caller uses.
- Each physical item is in exactly one pool at a time → no double-count, no reconciliation, no drift.

---

## Per-product tracking configuration
Serialization is a **per-product** property, **defaulted by Business Type, overridable in Admin** — not a separate inventory model. One engine, configured.

- Product-level setting, e.g. `unit_tracking` ∈ `{ 'none', 'on_promote', 'serialized_intake' }`:
  - **none** — quantity only; units never created. (Most manufacturer goods, supplies.)
  - **on_promote** — quantity base; a unit is promoted *only when it needs identity* (serial entered, sold with warranty, flagged damaged). (Warranty goods, occasional identification.)
  - **serialized_intake** — every unit promoted at **intake**; product effectively always unit-tracked. (Graded collectables.)
- **Business Type sets the default** (Manufacturer → `none`; Collector/Retailer → `serialized_intake` or `on_promote`; Service → `none`). **Account Admin / SuperAdmin can override per product**, same pattern as existing feature/module gating.
- A collectables tenant therefore still has quantity-only products (supplies) and serialized products (cards) side by side — the trigger is the product's setting, never the tenant's type.

---

## Step 0 — Investigate and report before building
1. **Confirm the SKU/variant/product structure** already built (category, subcategory, SKU on the product registration page). Report where SKU lives (product vs variant) and whether a variant layer exists, so the unit's `product_id`/`variant_id` FK targets the right level.
2. **Anonymous-quantity representation.** Confirm on-hand for a normal product is `warehouse_deliveries` (M/S/P/D/C) + `labor_production` as established. Identify the current single place (if any) that computes per-product on-hand — the new central helper will absorb/wrap it.
3. **Sale/delivery path.** Confirm `order_items` + `delivered_qty` + `trigger_order_item_delivered_qty` as the delivery mechanic. Determine how an order line would reference a *specific unit* for serialized products (see Sale interaction). Report whether `order_items` can carry a nullable `unit_id`.
4. **Existing Mode B design artifacts.** Confirm no `inventory_units` table exists yet and that Condition + Listing Status (Inventory → Listed → Sold) were designed but not implemented. Report any partial scaffolding.

Report all findings before schema changes.

---

## Data model

```sql
CREATE TABLE inventory_units (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      ...       NOT NULL,
  product_id     ...       NOT NULL,          -- the SKU-bearing product (or variant per Step 0)
  serial_number  TEXT,                         -- nullable; settable at ANY stage (intake, mid-stock, sale)
  condition      TEXT,                         -- nullable; e.g. New/Used/Damaged (free or enum per Step 0)
  listing_status TEXT NOT NULL DEFAULT 'Inventory'
                 CHECK (listing_status IN ('Inventory','Listed','Sold')),
  order_item_id  ...       NULL REFERENCES order_items(id) ON DELETE RESTRICT,  -- set when claimed/sold; RESTRICT blocks demote while in an active order
  acquired_at    TIMESTAMPTZ,                  -- intake time if known
  notes          TEXT,                         -- unit-level free notes (L3 will add structured service history)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uniqueness: product-scoped, WHEN NOT NULL (so blanks don't collide; "unit #001" may recur across products).
CREATE UNIQUE INDEX inventory_units_serial_uniq
  ON inventory_units (tenant_id, product_id, serial_number) WHERE serial_number IS NOT NULL;
```

- `serial_number` nullable and editable at any lifecycle stage — this is the "enter a serial for two damaged in-stock units" case. Not required to promote.
- `listing_status` is the unit lifecycle: **Inventory → Listed → Sold** (delist returns Listed → Inventory).
- `order_item_id` links a sold unit to its sale; the owning customer is reachable through the order. (L4 builds the ledger view on this; L1 just sets the link so on-hand is correct.)
- Add `unit_tracking` column to `products` (per config above).

---

## Promotion (atomic, conserving, no event log)
One operation, three triggers, always the same invariant.

**Operation:** in a single transaction — decrement the product's anonymous quantity by 1 **and** insert one `inventory_units` row. Total on-hand unchanged; the item simply moved pools. **No movement/audit row for the promotion itself** (per decision: only resulting counts matter).

- How "decrement anonymous quantity by 1" is represented depends on Step 0.2. If anonymous on-hand is purely `SUM(warehouse_deliveries)`, promotion posts a single balancing quantity row so the ledger sum drops by 1 as the unit appears — OR the central helper subtracts `COUNT(units)` from the ledger sum (see Helper below). **Prefer the latter** (helper subtracts) so promotion writes *only* the unit row and needs no new ledger movement type — simpler, fewer moving parts, and the "no event" decision falls out naturally.

**Triggers:**
- **Intake (serialized_intake products):** each received unit is promoted at receipt — a unit row per physical item, quantity not accumulated anonymously.
- **Manual (on_promote / any):** user enters a serial or flags condition on an in-stock item → promote that one item now.
- **Sale (on_promote, warranty case):** the sold item is promoted at delivery, capturing its serial, and set to Sold (see Sale interaction).

**Reverse (demote)** — rare, but define it: deleting an unsold unit row returns its count to anonymous quantity (inverse operation). Selling does *not* demote; it sets Sold.

---

## Sale / delivery interaction (needed for stock correctness)
Serialized products must leave on-hand correctly when sold.

- **On-hand for a unit-tracked product excludes Sold units:** counts `listing_status IN ('Inventory','Listed')` only.
- **serialized_intake / existing-unit sale (collectables):** the buyer is choosing a specific unit. Claiming it on an order line sets the unit to **Listed** and `order_item_id` (the reservation — a unit already `Listed`/`Sold` cannot be claimed by another line). On delivery (`delivered_qty` up), it flips **Listed → Sold**. No 'D' quantity row — the unit status *is* the stock change. (Order cancelled before delivery → unit returns to `Inventory`, `order_item_id` cleared.)
- **on_promote sale (warranty):** the order line is for an otherwise-anonymous product. On delivery, **promote** the sold item (anonymous −1, create unit row) and set it Sold with its serial captured. Net effect on on-hand is identical to a normal delivery (−1), but the sold copy now has a durable identity for L2/L3.
- **none products:** unchanged — normal `delivered_qty`/'D' flow.

The delivery trigger/handler branches on the product's `unit_tracking`. This is the one place the two worlds meet at sale; keep it in the single delivery chokepoint (per the service-BOM precedent).

---

## Central stock-resolution helper — a Postgres function (the linchpin)
Because the callers are large inline multi-CTE SQL queries (e.g. warehouse-inventory's ~85-line CTE producing on-hand/committed/on-order/available in one pass), a JS helper can't wrap them without duplicating SQL. So the single source of truth is a **Postgres function or view**, delivered as a migration, that every query joins to instead of computing on-hand inline.

Shape (function returning per-product on-hand + pool breakdown):
```
unit-tracked on_hand = anonymous_ledger_qty            -- remaining anonymous pool
                     + count(units WHERE status IN ('Inventory','Listed'))
none         on_hand = anonymous_ledger_qty            -- existing M/S/P/D/C + labor_production, unchanged
```
Implement as e.g. `fn_product_onhand(tenant_id, product_id)` or a `product_stock` view keyed on product; callers `JOIN` it and select `on_hand` rather than recomputing. Note the anonymous pool is `ledger_sum − count(units)` for unit-tracked products, so **promotion writes only the unit row** (no balancing ledger movement) and the function nets it automatically.

- **All existing callers route through it:** `warehouse-inventory.mjs`, `supply-chain-overview.mjs`, ATP (`committed`/`available`), BOM reads. None compute on-hand inline anymore — they join the function/view.
- **ATP:** `available = on_hand − committed`; committed unchanged. Correct for serialized products because sold units have left on-hand.
- **BOM:** materials are `none`-tracked (no change); the function is simply the universal entry point.
- A duplicated SQL fragment per query is **rejected** — it is the exact drift this prevents. One DB object, one truth.
- This function is the single most important artifact in L1.

---

## Frontend

### 1. Warehouse.tsx — units surface in the Products view
- A unit-tracked product shows its on-hand (anonymous + in-stock units) as one number, expandable to list its named in-stock units (serial, condition, listing status).
- Quantity-only products render exactly as today.
- The existing "Products" and "Input goods / materials" sections (from BOM) are unchanged in structure; units appear within Products.

### 2. Unit management
- Create/edit a unit: serial (optional), condition, listing status. Promote-from-stock action on a quantity product ("identify a unit"). Delist (Listed → Inventory). These are the manual promotion triggers.
- For serialized_intake products, intake creates units directly (tie into the receiving/intake path).

### 3. Product settings
- `unit_tracking` selector on the product (defaulted by BT, per config). Show which mode a product is in.

### 4. i18n (EN/SV/ES)
Unit, Serial number, Condition, Listing status (Inventory/Listed/Sold), Identify unit / Promote. SV: Enhet, Serienummer, Skick, Status. ES: Unidad, Número de serie, Estado, Estado de listado. Match existing keys.

---

## QA checklist
- [ ] `none` product: on-hand and all views identical to pre-L1 baseline (no regression)
- [ ] `serialized_intake` product: receive 5 → 5 unit rows, on-hand 5, anonymous quantity 0
- [ ] `on_promote` product: quantity 10; identify 1 damaged unit (enter serial) → 1 unit row + anonymous 9, **on-hand still 10** (promotion conserves total)
- [ ] Sell a specific collectable unit → that unit Sold, on-hand −1, correct unit left inventory; other units untouched
- [ ] Sell an `on_promote` (warranty) item → unit promoted + Sold with serial captured; on-hand −1 exactly as a normal delivery
- [ ] Claim a unit on an order → it goes `Listed`; a second order cannot claim the same unit; cancel before delivery → returns to `Inventory`
- [ ] Delete an unsold unit (demote) → count returns to anonymous quantity, total unchanged
- [ ] Attempt to demote/delete a unit tied to an active order line → blocked by FK RESTRICT with a clear error message
- [ ] Serial uniqueness enforced per tenant; multiple NULL serials allowed
- [ ] **Total on-hand and every per-row quantity correct** across mixed products in one tenant (the core invariant)
- [ ] ATP `available` correct for a unit-tracked product (sold units excluded, committed respected)
- [ ] BOM material/finished reads unchanged (all via the helper)
- [ ] Warehouse and Supply Chain Overview identical for sellable products; all stock reads route through `resolveProductStock`
- [ ] BT default applies to new products; Admin override changes a single product's mode
- [ ] EN/SV/ES labels render

## Future layers (out of scope for L1 — named, with seams)
- **L2 — Warranty Records:** structured warranty (start/end, coverage) FK'd to `inventory_units.id`. Seam: the unit row exists and is stable.
- **L3 — Service History:** timestamped free-form service notes FK'd to `inventory_units.id`. Seam: same. (L1's `notes` is a placeholder; L3 formalizes as timestamped rows.)
- **L4 — Customer Ledger:** aggregation of a customer's owned units (via `order_item_id` → order → customer) + warranties + service + **customer-level notes** that belong to the customer and do NOT travel when a unit is resold. Seam: `order_item_id` on the unit; a new customer-notes store.
- **Ownership transfer to a non-customer (future, keep in mind):** a unit resold privately to someone not in the tenant's customer table who still claims warranty/service. Requires warranty/service to be reachable by a unit whose current holder isn't a customer row. L1 does not preclude this (warranty/service hang off the unit, not the customer) but does not implement it.
- **BOM + `serialized_intake` (production-as-intake):** producing a serialized finished good should create N unit rows from `labor_production.qty_produced`. The current production save doesn't do this. **Explicitly out of L1** — a follow-up path. In L1, `serialized_intake` products are populated via receipt or manual promotion only.
- **`Listed` has no backing listings table in L1** — it is a local visual flag (and now the reservation marker), not a marketplace sync. Any multi-channel listings table is future.
- **Also out of scope:** migrating anonymous quantity onto `inventory_movements`; hybrid variant-level serialization beyond Step 0 findings.
