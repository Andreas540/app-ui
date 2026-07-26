# Inventory Availability (ATP) — Implementation Plan

## Overview

Extend the current inventory views so users see not only what is physically on the shelves, but **how much is left to sell** and **what is incoming**. No schema changes — this is a read-model extension of existing data.

New per-product numbers, using standard Available-to-Promise (ATP) terminology:

| Metric | Definition | Formula |
|---|---|---|
| **On hand** | Physically in stock (existing Total; split into Pre-prod / Finished as today) | Current calculation, unchanged |
| **Committed** | Qty on customer orders placed but **not yet delivered** | `SUM(order_items.qty)` where parent order `delivered = FALSE` |
| **Available (finished)** | Finished goods left to sell | `Finished − Committed` |
| **Available (total)** | Total stock left to sell | `Total − Committed` |
| **On order** | Qty on supplier orders **not yet received** | `SUM(order_items_suppliers.qty)` where parent supplier order `received = FALSE` |

**Design rules (do not "improve" these away):**

1. **Never clamp Available to zero.** Negative Available is the most important signal on the page — it means the user has promised more than they can deliver. Display negative values, styled as a warning (red).
2. **Committed subtracts from Finished, not Pre-prod.** Customer orders are fulfilled from finished goods. Available (total) is still shown because it tells the user whether producing from pre-prod stock can cover the gap.
3. **Source-of-truth discipline (hard-won rule in this codebase):** on-hand numbers come only from `warehouse_deliveries` + `labor_production`. Committed comes only from `orders`/`order_items`. On order comes only from `orders_suppliers`/`order_items_suppliers`. Do not mix sources or the Warehouse page and Supply Chain Overview will drift apart again.

---

## Pre-implementation verification (Claude Code: do these first)

1. **Order status fields.** Inspect the `orders` table. Confirm whether any cancellation/void mechanism exists (a `status` column, `cancelled` flag, or soft delete). If yes: exclude those orders from Committed. If orders are hard-deleted on cancellation: no exclusion needed. Report findings before writing the SQL.
2. **Same check for `orders_suppliers`** regarding On order.
3. **Partial deliveries.** Confirm `orders.delivered` and `orders_suppliers.received` are whole-order booleans (believed true). If so, Committed/On order are all-or-nothing per order — no per-line delivered tracking needed.
4. **Locate all endpoints that compute inventory:** `netlify/functions/warehouse-inventory.mjs` and the Supply Chain Overview endpoint. Both must be updated with **identical** committed/on-order logic (shared SQL fragments or a shared helper if the codebase pattern allows).

---

## Backend changes

### 1. `warehouse-inventory.mjs`

Extend the response per product with `committed`, `on_order`, `available_finished`, `available_total`. Approach: compute on-hand as today, then LEFT JOIN two aggregate CTEs:

```sql
WITH committed AS (
  SELECT oi.product_id, SUM(oi.qty) AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = ${TENant_ID}
    AND o.delivered = FALSE
    -- AND <not cancelled>, per verification step 1
  GROUP BY oi.product_id
),
on_order AS (
  SELECT ois.product_id, SUM(ois.qty) AS qty
  FROM order_items_suppliers ois
  JOIN orders_suppliers os ON os.id = ois.order_id
  WHERE os.tenant_id = ${TENANT_ID}
    AND os.received = FALSE
    -- AND <not cancelled>, per verification step 2
  GROUP BY ois.product_id
)
SELECT ... COALESCE(c.qty, 0) AS committed, COALESCE(oo.qty, 0) AS on_order ...
```

**Join direction matters:** use a FULL picture of products. A product can have committed orders but zero rows in `warehouse_deliveries` (sold before any stock was registered → Available must show negative, not be missing from the list). Anchor the query on the products that appear in *any* of the three sources (on-hand ledger, committed CTE, on-order CTE), e.g. via FULL OUTER JOIN or a UNION of product_ids. Verify tenant scoping (`tenant_id`) on every branch.

`committed` and `on_order` are always returned ≥ 0; `available_*` may be negative.

### 2. Supply Chain Overview endpoint

Add the same two CTEs and expose the same four new fields for the "In the warehouse" section. **The committed/on-order SQL must be byte-for-byte the same logic as in warehouse-inventory.mjs.** Any intentional difference must be documented in a code comment.

---

## Frontend changes

### 1. Warehouse page (`Warehouse.tsx`)

Extend the existing inventory table columns from `Pre-prod | Finished | Total` to:

`Pre-prod | Finished | Total | Committed | Available (finished) | Available (total) | On order`

- Negative Available values: red text (reuse existing warning/error color token).
- Zero values render as `0`, not blank.
- Column header tooltips (short): Committed = "On customer orders not yet delivered". On order = "On supplier orders not yet received". Available = "Finished/Total minus committed".
- If the table becomes too wide on mobile, follow the existing responsive table pattern in the codebase (check how other wide tables are handled before inventing a new pattern).

### 2. Supply Chain Overview — "In the warehouse" section

Same columns added to the existing per-product table. Numbers must match the Warehouse page exactly (this is the regression that has bitten before — see QA).

### 3. i18n

All new labels/tooltips via react-i18next in EN/SV/ES, following existing key conventions. Suggested SV: Committed = "Reserverat", Available = "Tillgängligt", On order = "Beställt". Suggested ES: "Comprometido", "Disponible", "Pedido a proveedor". Adjust to match any existing terminology in the translation files.

---

## Edge cases

- **Product with committed qty but no stock rows** → appears in list with On hand 0 and negative Available (see join note above).
- **Order marked delivered** → its qty leaves Committed *and* the 'D' trigger reduces Finished in the same action; net Available (finished) is unchanged by the delivery event itself. Sanity-check this in QA.
- **Supplier order marked received** → leaves On order, enters Pre-prod via the 'S' trigger. Available (finished) unchanged; Available (total) increases.
- **Unreceiving / undelivering** (flags flipped back to FALSE) → numbers must return to prior state, since both triggers already delete/restore ledger rows and the CTEs are computed live.
- Products filtered per tenant everywhere (standard `resolveAuthz()` scoping).

## QA checklist

- [ ] Warehouse page and Supply Chain Overview show **identical** numbers for every product in a test tenant (the historical failure mode — test explicitly)
- [ ] Place a customer order (not delivered) → Committed rises, Available falls, On hand unchanged
- [ ] Mark it delivered → Committed falls, Finished falls, Available (finished) net unchanged
- [ ] Oversell scenario: commit more than Finished → Available shows negative, in red
- [ ] Place supplier order → On order rises; mark received → moves to Pre-prod, On order falls
- [ ] Flip delivered/received back to FALSE → all numbers revert
- [ ] Product with orders but zero ledger rows appears with negative Available
- [ ] Cancelled orders (if mechanism exists) excluded from Committed
- [ ] EN/SV/ES labels render
- [ ] Mobile/narrow layout acceptable

## Out of scope (future phases — do not build now)

- Per-line partial deliveries
- Reserving specific stock against specific orders (soft allocation only, via aggregate math)
- Serialized/unit-tracked inventory mode, locations, BOM — separate architecture track
