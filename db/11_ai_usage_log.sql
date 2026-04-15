-- AI usage logging — feeds Stripe metered billing and usage dashboards.
-- Mirrors the pattern used for SMS (message_jobs + stripe_reported flag).
-- One row per AI API call; the scheduled sync-stripe-ai-usage function
-- batches unreported rows and reports them to Stripe Meters, then sets
-- stripe_reported = true.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature        TEXT NOT NULL,   -- e.g. 'customer_analysis', 'supply_chain_analysis'
  model          TEXT NOT NULL,
  input_tokens   INT  NOT NULL DEFAULT 0,
  output_tokens  INT  NOT NULL DEFAULT 0,
  stripe_reported BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_tenant_unreported
  ON public.ai_usage_log(tenant_id, stripe_reported, created_at DESC);

-- Add AI billing flag + price to tenant settings.
-- stripe_ai_subscription_item_id acts as the "AI billing enabled" flag
-- (same pattern as stripe_sms_subscription_item_id).
ALTER TABLE public.tenant_billing_settings
  ADD COLUMN IF NOT EXISTS stripe_ai_subscription_item_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_price_per_1k_tokens NUMERIC(12,6) NOT NULL DEFAULT 0.005000;

-- Extend monthly usage snapshots with AI columns.
ALTER TABLE public.usage_snapshots_monthly
  ADD COLUMN IF NOT EXISTS ai_calls_count  INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_billed_amount NUMERIC(12,4) NOT NULL DEFAULT 0;
