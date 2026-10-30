-- Stores which partners are hidden per tenant.
-- Blacklist approach: absence = visible (new partners auto-show).
CREATE TABLE IF NOT EXISTS tenant_hidden_partners (
  tenant_id  UUID NOT NULL,
  partner_id UUID NOT NULL,
  PRIMARY KEY (tenant_id, partner_id)
);
