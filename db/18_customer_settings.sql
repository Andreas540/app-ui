-- Stores which customers are hidden per tenant.
-- Blacklist approach: absence = visible (new customers auto-show).
CREATE TABLE IF NOT EXISTS tenant_hidden_customers (
  tenant_id   UUID NOT NULL,
  customer_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, customer_id)
);
