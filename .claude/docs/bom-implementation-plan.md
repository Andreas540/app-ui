# Bill of Materials (BOM) — v1 Implementation Plan (Products + Services)

## Goal
Let **Manufacturer** and **Service** tenants define, per finished product or service, the **input materials and quantities** consumed to produce/deliver one unit — the Bill of Materials (recipe). Consuming inputs happens automatically:
- **Products:** when **production is logged** (`labor_production`), with a manual override step.
- **Services:** when the service line is **marked delivered**, strictly by recipe, **no override**.

A material's stock decrements as it's consumed; a manufactured product's finished stock increments as before. Services produce no inventory — they only consume.

### Scope decisions (all confirmed)
- **Flat BOM only** (no multi-level / recursive explosion).
- **Products auto-consume with manual override** at production logging. **Override UI shown ONLY for BOM products.**
- **Services auto-consume strictly by recipe, no override.**
- **Versioned recipes** — editing creates a new version; historical production/delivery keeps the actual quantities it consumed.
- **Recipe authoring lives in Tenant Admin** → Product/Service settings, new tab. In-app product/service page shows "This product has a recipe" **read-only** with a link to Admin.
- **Materials are defined in Admin.** A material is a non-sellable input (`category = 'material'`, no price). It is never sold to customers.
- **Two Warehouse.tsx sections:** "Products" (all sellable goods; BOM ones marked with a recipe icon) + an **expandable "Input goods / materials"** section.
- **Supply Chain Overview:** materials **excluded**. Parity ("both pages show identical numbers") now applies **only to sellable products**.
- **Business Types:** BOM is a capability of the **Manufacturer** BT (covers BOM / non-BOM / hybrid — BOM-ness is per-product, not per-tenant) and the **Service** BT. Non-BOM products keep today's crude 1:1 model. Reseller is a separate BT/mode, later.
- **Dual-nature items (a thing both sold to customers AND used as an input) are OUT of scope** — deliberately deferred to reduce complexity and risk. A material is input-only; a product/service is sellable-only. This will be revisited with Reseller mode.
- **Out of scope this doc:** buying finished goods for resale (Reseller mode); dual-nature items; multi-level BOM; reserving/allocating inputs; input-requirements-from-committed-demand (MRP-lite).

---

## The critical model interaction (read first)

Current formula in `warehouse-inventory.mjs`:
- `pre_prod = (M + S) − produced_qty`
- `finished = P + produced_qty − D`

The `− produced_qty` is a **crude single-input assumption** (raw material and finished good treated as the same product — correct for non-BOM 1:1 assembly). BOM separates input and finished into different products, so:

1. **BOM products:** do **NOT** subtract `produced_qty` from that product's own `pre_prod`. Producing adds to `finished` only; input consumption is posted as 'C' rows against the **material** products. Applying both = phantom negative pre-prod.
2. **Non-BOM products:** **unchanged** (crude model stays — this is the exact 1:1 "buy the parts, assemble" case).
3. **Materials:** never produced (`produced_qty = 0`); stock = received (M+S) − consumed ('C').

This conditional is the #1 correctness risk. QA covers it first.

---

## Concept map

| Type | Consumes inputs? | Creates finished stock? | Consumption trigger | Override? |
|---|---|---|---|---|
| **BOM product** | Yes | Yes | Production logged | **Yes** |
| **Non-BOM product** | No (crude pre-prod) | Yes | Production logged | No |
| **Service (with recipe)** | Yes | **No** | Line marked delivered | **No** |
| **Material** | — (is the input) | No | — | — |

---

## Step 0 — Investigate and report before building
1. **Products vs services vs materials storage.** Confirm services are `products` rows with `category = 'service'` (implied by the existing `category != 'service'` filter). Confirm materials can be represented as `products` rows with `category = 'material'` (non-sellable, no price). Report the current `products` schema (columns, category values, any price column) and confirm the `category = 'material'` scheme fits before changing anything.
2. **Production entry point(s).** Find what writes `labor_production`; the explosion + override UI hooks here. Report all paths.
3. **Delivery path(s) for services.** We now have `trigger_order_item_delivered_qty` (on `order_items UPDATE OF delivered_qty`, delete-and-recreate scoped to `(order_id, product_id)`), plus app-code delivery in `order.mjs` PUT and the Dashboard boolean toggle. Determine the **single chokepoint** where a delivered_qty delta is known for *every* path — service consumption must hook there (see Consumption below). Report whether the trigger is that chokepoint or whether app paths bypass it.
4. Confirm the inventory formula in **both** `warehouse-inventory.mjs` and `supply-chain-overview.mjs`.

---

## Data model

### Recipe tables (versioned) — shared by products AND services
```sql
CREATE TABLE product_boms (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   ...      NOT NULL,
  product_id  ...      NOT NULL,     -- finished product OR service (both live in products)
  version     INT      NOT NULL,
  is_active   BOOLEAN  NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, version)
);  -- exactly one active version per (tenant, product)

CREATE TABLE bom_items (
  id               BIGSERIAL PRIMARY KEY,
  bom_id           BIGINT  NOT NULL REFERENCES product_boms(id) ON DELETE CASCADE,
  input_product_id ...     NOT NULL,   -- a material (category = 'material')
  qty_per_unit     NUMERIC NOT NULL CHECK (qty_per_unit > 0)
);
```
Editing a recipe = new `product_boms` row (version+1, active), previous marked inactive. Never mutate an existing version's `bom_items` in place.

### Product kinds (via `category` — no new flag needed)
- **Regular/finished product:** sellable good, normal category.
- **Material:** `category = 'material'`, not sellable, no price, created in Admin. This is the only thing usable as a recipe input.
- **Service:** `category = 'service'`, not inventoried, may have a recipe.

Since dual-nature items are out of scope, "is this an input?" is simply `category = 'material'` — no separate `is_input` boolean.

### Consumption rows — keep the ledger to two sources
Post consumption as **'C'** (Consumed) rows in the existing `warehouse_deliveries` ledger: negative qty, `product_id` = the material. Rationale: the hard rule here is stock = `warehouse_deliveries` + `labor_production` and nothing else; a third source table reintroduces the drift bug. Add `'C'` to the movement-type set. Add nullable **`source_ref`** columns to link a 'C' row to its origin for clean reversal — e.g. `source_production_id` (for product consumption) and `source_order_item_id` (for service consumption). Confirm columns don't already exist.

---

## Consumption logic

Two drivers, both producing 'C' rows in the same format, both reversible. Funnel each through a shared helper that posts/reverses 'C' rows given `(material_id, qty, source_ref)`.

### A. Product production (app code, override)
On logging production of BOM product P, qty = X:
1. Load P's active BOM; default consumed per material = `X × qty_per_unit`.
2. Show exploded list, **editable** (override). Non-BOM product → skip entirely (no explosion, crude `produced_qty` path unchanged).
3. Transaction: insert `labor_production` (store `bom_id` used) + one 'C' row per material (negative **actual** consumed, `source_production_id`).
4. Edit/delete of the production event reverses its 'C' rows (by `source_production_id`) and re-posts — delete-and-recreate, mirroring the delivery pattern.
5. Insufficient material stock → **allow**, post anyway (material goes negative), surface a **warning**; never block. Consistent with the negative-Available philosophy.

### B. Service delivery (delivery-delta driven, NO override)
When a **service** line (`category = 'service'`) with an active BOM has its `delivered_qty` change by delta Δ:
- Explode the service's active recipe; post 'C' rows for each material = `Δ × qty_per_unit` (negative), `source_order_item_id` = the line. A negative Δ (un-deliver) reverses proportionally.
- Strictly by recipe — no override, no user prompt (matches the fast delivery-toggle UX).
- **Hook location:** this must fire for *every* delivery path (modal, `order.mjs` edit, Dashboard toggle). Per Step 0.3, wire it at the single chokepoint. **Recommended:** handle it inside `trigger_order_item_delivered_qty` (the DB chokepoint every path funnels through), branching on "line's product is a service with an active BOM." If Step 0 shows app paths bypass the trigger, instead centralize in a shared service function that all three paths call. Do **not** implement it in only one path.
- Services are excluded from inventory display already, so no 'D'/stock effect on the service itself — only 'C' on its materials.

---

## Order pickers (filter, not schema)
- **Customer order** (`order_items`): show sellable items = `category NOT IN ('material')` (includes goods and services). **Excludes materials.** ← must be deliberate; the default "all products" picker would wrongly expose materials.
- **Supplier order** (`order_items_suppliers`): show orderable stock = goods + **materials** (`category != 'service'`). Materials restock via the existing `received` → 'S' path for free.
- **Recipe input picker** (Admin): show `category = 'material'`.

---

## Inventory calculation (`warehouse-inventory.mjs` + `supply-chain-overview.mjs`, identical)
1. **Conditional `produced_qty`:** subtract from `pre_prod` **only for products without an active BOM**. LEFT JOIN `product_boms (is_active)` → `has_bom`; `pre_prod = (M+S) + C − (CASE WHEN has_bom THEN 0 ELSE produced_qty END)`.
2. **Include 'C' rows** in the received/pre-prod bucket (C already negative) so material stock = M + S + C. Audit every place that sums movement types to ensure none silently omit 'C'.
3. **Products view:** sellable goods (`category NOT IN ('service','material')`), committed/available/on-order as today, recipe icon where `has_bom`.
4. **Materials view (Warehouse only):** materials (`category = 'material'`) with material-appropriate columns: on-hand, on-order, consumed, and "used in" (products/services referencing it). No committed/available (not sold).
5. **Supply Chain Overview:** unchanged except the `produced_qty` conditional; **no materials**. Parity test applies to sellable products only.

---

## Frontend

### 1. Warehouse.tsx — two sections
- **Products** table: all sellable goods; recipe icon on BOM rows (optional: expand row to show recipe read-only).
- **Input goods / materials**: expandable section, materials columns above.

### 2. Tenant Admin → Product/Service settings → new "Recipes / BOM" tab
- Manage **materials** (create materials: name, unit, supplier link, `category = 'material'`, no price).
- Author **recipes** for products and services: pick the product/service, add input rows (input picker = materials + qty per unit). Save → new version. Show current version; minimal read-only version history.
- Guards: a product can't be its own input; flat-only (a material has no recipe of its own in v1 — state this in the UI).

### 3. In-app product/service page
- Read-only "This product has a recipe (vN)" badge + link to Admin to edit.

### 4. Production logging UI
- For **BOM products only**: after product + qty, show editable exploded consumption (material · required · consumed[editable]), negative-stock warning. Non-BOM and services: no such UI.

### 5. i18n (EN/SV/ES)
Recipe/BOM, Material, Qty per unit, Consumed, Required, Used in. SV: Recept, Material, Åtgång, Förbrukat, Krävs, Används i. ES: Receta, Material, Cantidad por unidad, Consumido, Requerido, Usado en. Match existing keys.

---

## QA checklist
- [ ] **Non-BOM product:** production identical to pre-BOM baseline (crude decrement); no regression
- [ ] **BOM product:** finished product's `pre_prod` does NOT go negative after production
- [ ] Produce 10 of BOM product needing 2×A + 1×B → material A −20, B −10, finished +10
- [ ] Production override: change consumed A 20→18 before save → A −18; recipe version unchanged
- [ ] Edit production qty → 'C' rows re-posted correctly, no double/leftover consumption; delete production → 'C' reversed, finished −
- [ ] **Service:** deliver 3 units of a service needing 2×oil → oil −6, no finished stock created, no service inventory row
- [ ] Service partial/incremental delivery (1 then 2) consumes on the delta; un-deliver reverses; works via modal AND edit-form AND dashboard toggle paths
- [ ] Recipe versioning: change recipe → new version; new production/delivery uses new recipe, old records keep original consumption
- [ ] Insufficient material → production/service allowed, material negative shown in red, not blocked
- [ ] **Pickers:** material NOT selectable on customer order; IS selectable on supplier order and as recipe input; supplier receipt of a material ('S') increments its stock
- [ ] Warehouse Products and Supply Chain Overview show identical numbers for sellable products; materials absent from Supply Chain Overview
- [ ] EN/SV/ES labels render

## Out of scope (future)
- **Dual-nature items** (sold AND used as input) — revisit with Reseller mode.
- Buying finished goods for resale (Reseller mode).
- Multi-level/recursive BOM.
- Input requirements exploded from committed customer demand (MRP-lite) — the natural next step, consumes the committed numbers already built.
- Reserving/allocating materials against planned production.
- Migrating manufacturing mode onto `inventory_movements`.
