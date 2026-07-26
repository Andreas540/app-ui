# Per-Product Delivery Tracking (line-level delivered qty)

## Goal
Let users record delivered quantity **per product** on an order, so multi-product and partial deliveries are tracked correctly and the inventory Committed/Available columns reflect reality.

## Root problem
Delivered quantity is currently stored at the **order level** (a single `delivered_quantity` total on the order, saved via the delivery modal in `CustomerDetail.tsx` → PUT `/api/orders-delivery` → `orders-delivery.mjs`). One total per order cannot be split across multiple products, so:
- Multi-product orders can't record "product A delivered, product B not."
- The Committed column (in `warehouse-inventory.mjs`) gates on the whole-order boolean and sums full ordered qty, so it ignores partial deliveries.

Fix: move delivered qty to the **line** (`order_items.delivered_qty`), and update every layer that reads or writes it.

---

## Step 0 — Investigate and report before changing anything
Confirm the current reality (our notes may be stale). Report findings first:
1. **Where delivered qty lives today.** Inspect `orders` and `order_items` columns. Confirm delivered qty is on `orders` (order-level) and that `order_items` has no per-line delivered field yet.
2. **What posts the 'D' row** into `warehouse_deliveries` (DB trigger vs app code — check `pg_proc`/`information_schema.triggers`, else grep for `warehouse_deliveries` and `'D'`). Read its exact logic: does it post one 'D' row per line, or one summed row? Does it post the full qty or the delivered qty? This determines how partial 'D' rows are currently created.
3. **The delivery modal + endpoint.** Read the `DeliveryModal` in `CustomerDetail.tsx`, `handleDeliverySave`, and `orders-delivery.mjs`. Note the current request shape (`{ order_id, delivered_quantity }`) and how the three-state icon (not/partly/fully delivered) is derived.

Do not proceed to schema changes until these three are confirmed and reported.

---

## Data model
Add per-line delivered tracking:

```sql
ALTER TABLE order_items
  ADD COLUMN delivered_qty NUMERIC NOT NULL DEFAULT 0;
```

**Backfill (guarded — this touches live stock, do it carefully):**
- For orders currently marked fully delivered: set each line's `delivered_qty = qty`.
- For orders with an order-level partial `delivered_quantity`: this can't be perfectly attributed across lines. For **single-line orders**, set `delivered_qty = orders.delivered_quantity`. For **multi-line orders with a partial total** (should be rare/none, since the feature never really worked), list them in the report and ask before guessing — do not silently distribute.
- Backfill must set columns **directly without firing the 'D'-posting trigger** (existing 'D' rows already exist — re-firing would double-post). Disable/guard the trigger during backfill.
- Keep the old `orders.delivered_quantity` column for now (don't drop in this change); stop writing to it once line-level is live, remove in a later cleanup.

`orders.delivered` becomes **derived**, not authoritative: an order is fully delivered when every line has `delivered_qty = qty`, partially when some line has `0 < delivered_qty < qty` or lines differ, undelivered when all are 0. Keep the column updated (trigger or app) for backward compatibility, but the source of truth is now the lines.

---

## Backend

### `orders-delivery.mjs` — accept per-line quantities
Change the request to carry line-level data, e.g.:
```json
{ "order_id": "...", "lines": [ { "order_item_id": "...", "delivered_qty": 50 }, ... ] }
```
- Validate each `delivered_qty` is between 0 and that line's ordered `qty` (clamp/reject out-of-range).
- Update each `order_items.delivered_qty`.
- Recompute and persist the derived `orders.delivered` state.
- Keep single-product orders working with the same endpoint (a `lines` array of one).
- `resolveAuthz()` tenant scoping as usual.

### 'D' posting logic (trigger or app code) — post the delta per line
The 'D' rows must reflect **delivered_qty per line**, not the ordered qty and not an order boolean:
- When a line's `delivered_qty` changes from OLD to NEW, post a 'D' row for the **delta** (`NEW − OLD`), negative qty, for that line's `product_id`. A negative delta (un-delivering) posts a positive-qty correction (or deletes/adjusts) so stock returns correctly.
- This replaces any logic that posts a single summed 'D' row or posts on the order boolean.
- Preserve the existing date behavior unless we decide otherwise (note: current triggers stamp current EST date — out of scope to change here).

### Committed CTE — subtract delivered per line
In `warehouse-inventory.mjs` (and the identical logic in the **Supply Chain Overview** endpoint):
```sql
committed AS (
  SELECT oi.product_id,
         SUM(oi.qty - oi.delivered_qty) AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = ${TENANT_ID}
    AND oi.product_id IS NOT NULL
    -- no longer gate on o.delivered; fully-delivered lines contribute 0 naturally
  GROUP BY oi.product_id
)
```
- Drop the `o.delivered = FALSE` gate — it's now handled by `qty - delivered_qty` (a fully delivered line contributes 0).
- Keep `available_finished` / `available_total` formulas as-is (they consume `committed`); Available may still be negative (intended).
- The `committed_orders` json_agg detail should show remaining (`qty - delivered_qty`) per order, not full ordered qty.

---

## Frontend — delivery modal in `CustomerDetail.tsx`

The three-state delivery icon on each order row still opens the modal. Modal behavior:

- **Single-product order:** keep current UX — one delivered-qty input against the ordered qty. (Works as-is; just point it at the line instead of the order total.)
- **Multi-product order (>1 line):** show a row per product with **product name · ordered qty · delivered qty input**. Each input defaults to its current `delivered_qty`, max = ordered qty. Save sends the `lines` array.
- After save, the row's three-state icon reflects the derived state: none delivered → empty, all lines full → delivered, anything in between → partly delivered.
- Keep the existing Authorization header pattern (`Bearer` token) on the fetch — this was a past multi-tenant bug, don't regress it.
- i18n (EN/SV/ES) for any new labels ("Ordered", "Delivered", per existing keys).

The endpoint needs each line's ordered qty and current delivered qty to render the modal — confirm the order-detail fetch already returns line items (product name, qty, delivered_qty); if not, extend it.

---

## QA checklist
- [ ] Single-product order, deliver 50 of 100 → Finished −50, Committed 50, Available reflects both
- [ ] Deliver remaining 50 → Committed 0, order icon shows fully delivered
- [ ] Multi-product order (A×10 in stock, B×5 not ready): deliver A fully, B zero → A's Committed drops by 10 and Finished drops by 10; B unchanged; order icon shows **partly delivered**
- [ ] Then deliver B → order icon flips to fully delivered
- [ ] Un-deliver a line back toward 0 → 'D' correction posts, Finished and Committed return correctly
- [ ] delivered_qty cannot exceed ordered qty (server rejects/clamps)
- [ ] Warehouse page and Supply Chain Overview show identical Committed for every product
- [ ] Backfill: previously fully-delivered orders show delivered lines and correct Committed with no double-posted 'D' rows
- [ ] Multi-tenant: modal saves for a non-BLV tenant (Authorization header present)
- [ ] EN/SV/ES labels render

## Out of scope
- Dropping `orders.delivered_quantity` (later cleanup)
- Changing the EST date-stamping behavior of movement rows
- Supplier-side (`orders_suppliers.received`) partial receipts — same problem, separate task (flag if it's blocking On-order accuracy)
