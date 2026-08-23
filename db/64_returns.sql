-- Customer returns: physical return of goods from a customer, with optional financial settlement.
-- A return links to an order and its line items (partial returns supported).
-- Settlement can be a cash refund, store credit, or none.
-- Partner share reversal is optional and tracked separately.
-- Inventory restocking is tagged but not yet acted upon (field reserved for future use).

CREATE TABLE IF NOT EXISTS returns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_date      DATE NOT NULL,
  reason           TEXT NOT NULL CHECK (reason IN (
                     'changed_mind', 'wrong_item', 'defective',
                     'damaged_delivery', 'duplicate', 'other'
                   )),
  reason_notes     TEXT,                          -- free text for reason = 'other'
  condition        TEXT NOT NULL CHECK (condition IN (
                     'resellable', 'damaged', 'not_returned'
                   )),
  restock_requested BOOLEAN NOT NULL DEFAULT FALSE, -- reserved; no stock adjustment yet
  supplier_fault   BOOLEAN NOT NULL DEFAULT FALSE,  -- tag for future supplier claims
  settlement_type  TEXT NOT NULL CHECK (settlement_type IN ('refund', 'store_credit', 'none')),
  settlement_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  settlement_date  DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS return_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id      UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id  UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  qty_returned   NUMERIC(10,2) NOT NULL CHECK (qty_returned > 0),
  unit_price     NUMERIC(12,2) NOT NULL  -- snapshot of price at time of return
);

-- Only created when the user chooses to reverse the partner share on a return.
CREATE TABLE IF NOT EXISTS return_partner_adjustments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id        UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  partner_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_reversed  NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS returns_tenant_id       ON returns(tenant_id);
CREATE INDEX IF NOT EXISTS returns_customer_id     ON returns(customer_id);
CREATE INDEX IF NOT EXISTS returns_order_id        ON returns(order_id);
CREATE INDEX IF NOT EXISTS return_items_return_id  ON return_items(return_id);
