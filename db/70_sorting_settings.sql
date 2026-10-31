-- Per-tenant list sorting for Customers and Partners.
--
-- Base sort is always a real comparator ('name' | 'owed'); custom order is an overlay
-- layered on top, activated by the *_sort_use_custom flag. Keeping Custom out of the
-- base avoids a circular definition, since unpositioned rows fall back to the base sort.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_customer_sort    TEXT    NOT NULL DEFAULT 'name';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS default_partner_sort     TEXT    NOT NULL DEFAULT 'name';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS customer_sort_use_custom BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS partner_sort_use_custom  BOOLEAN NOT NULL DEFAULT false;

-- Positions. Absence = unpositioned, which sorts after positioned rows by the base sort
-- (mirrors order_page_products: ORDER BY COALESCE(sort_order, 999), name).
CREATE TABLE IF NOT EXISTS tenant_customer_sort (
  tenant_id   UUID    NOT NULL,
  customer_id UUID    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS tenant_partner_sort (
  tenant_id  UUID    NOT NULL,
  partner_id UUID    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, partner_id)
);
