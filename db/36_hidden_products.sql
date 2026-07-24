-- Tenant-level product/service hide table.
-- Hidden products are excluded from all dropdown menus and listings
-- but historical order records that reference them are unaffected.
CREATE TABLE IF NOT EXISTS tenant_hidden_products (
  tenant_id  UUID NOT NULL,
  product_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, product_id)
);
