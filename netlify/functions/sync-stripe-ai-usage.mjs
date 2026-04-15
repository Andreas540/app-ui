// netlify/functions/sync-stripe-ai-usage.mjs
// Netlify scheduled function — runs hourly.
// For each tenant with a Stripe AI subscription item, reports unreported
// AI usage (tokens) to Stripe metered billing and marks them stripe_reported=true.
// Also upserts ai_calls_count + ai_billed_amount in usage_snapshots_monthly.
//
// Mirrors the pattern of sync-stripe-sms-usage.mjs.

export const config = {
  schedule: '0 * * * *', // every hour
}

export async function handler() {
  try {
    const { neon }   = await import('@neondatabase/serverless')
    const { DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_AI_METER_EVENT_NAME } = process.env

    if (!DATABASE_URL) { console.error('DATABASE_URL missing'); return { statusCode: 500 } }

    if (!STRIPE_SECRET_KEY) {
      console.log('STRIPE_SECRET_KEY not set — Stripe AI usage sync skipped')
      return { statusCode: 200 }
    }
    if (!STRIPE_AI_METER_EVENT_NAME) {
      console.log('STRIPE_AI_METER_EVENT_NAME not set — Stripe AI usage sync skipped')
      return { statusCode: 200 }
    }

    const sql = neon(DATABASE_URL)

    // Find tenants with AI billing enabled and unreported usage
    const tenants = await sql`
      SELECT
        tbs.tenant_id,
        tbs.ai_price_per_1k_tokens,
        t.stripe_customer_id,
        COUNT(u.id)::int                          AS pending_calls,
        SUM(u.input_tokens + u.output_tokens)::int AS pending_tokens
      FROM public.tenant_billing_settings tbs
      INNER JOIN public.tenants t
        ON t.id = tbs.tenant_id::uuid
      INNER JOIN public.ai_usage_log u
        ON u.tenant_id = tbs.tenant_id
        AND u.stripe_reported = false
      WHERE tbs.stripe_ai_subscription_item_id IS NOT NULL
        AND t.stripe_customer_id IS NOT NULL
      GROUP BY tbs.tenant_id, tbs.ai_price_per_1k_tokens, t.stripe_customer_id
    `

    if (!tenants.length) {
      console.log('sync-stripe-ai-usage: no pending unreported usage')
      return { statusCode: 200 }
    }

    let totalReported = 0

    for (const tenant of tenants) {
      const { tenant_id, pending_calls, pending_tokens, ai_price_per_1k_tokens, stripe_customer_id } = tenant

      try {
        // Convert token cost to cents for Stripe Meters API
        // Stripe price is $0.01/unit → reporting cents gives correct dollar total
        const billedAmount     = (pending_tokens / 1000) * Number(ai_price_per_1k_tokens)
        const quantityInCents  = Math.max(1, Math.round(billedAmount * 100))

        const stripeBody = new URLSearchParams({
          event_name:                       STRIPE_AI_METER_EVENT_NAME,
          'payload[stripe_customer_id]':    stripe_customer_id,
          'payload[value]':                 String(quantityInCents),
        })

        const stripeRes = await fetch(
          'https://api.stripe.com/v1/billing/meter_events',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization:  `Bearer ${STRIPE_SECRET_KEY}`,
            },
            body: stripeBody.toString(),
          }
        )

        const stripeData = await stripeRes.json()

        if (!stripeRes.ok) {
          console.error(`Stripe AI report failed for tenant ${tenant_id}:`, stripeData.error?.message)
          continue
        }

        // Mark usage as reported
        await sql`
          UPDATE public.ai_usage_log
          SET stripe_reported = true
          WHERE tenant_id = ${tenant_id}
            AND stripe_reported = false
        `

        // Upsert monthly snapshot
        const periodStart = new Date()
        periodStart.setDate(1)
        periodStart.setHours(0, 0, 0, 0)

        const periodEnd = new Date(periodStart)
        periodEnd.setMonth(periodEnd.getMonth() + 1)
        periodEnd.setDate(0) // last day of month

        await sql`
          INSERT INTO public.usage_snapshots_monthly (
            tenant_id, period_start, period_end,
            ai_calls_count, ai_billed_amount
          ) VALUES (
            ${tenant_id},
            ${periodStart.toISOString().slice(0, 10)},
            ${periodEnd.toISOString().slice(0, 10)},
            ${pending_calls},
            ${billedAmount.toFixed(4)}
          )
          ON CONFLICT (tenant_id, period_start) DO UPDATE SET
            ai_calls_count   = usage_snapshots_monthly.ai_calls_count   + EXCLUDED.ai_calls_count,
            ai_billed_amount = usage_snapshots_monthly.ai_billed_amount + EXCLUDED.ai_billed_amount
        `

        totalReported += pending_calls
        console.log(`Reported ${pending_calls} AI calls (${pending_tokens} tokens) to Stripe for tenant ${tenant_id}`)
      } catch (tenantErr) {
        console.error(`Error processing tenant ${tenant_id}:`, tenantErr?.message)
      }
    }

    console.log(`sync-stripe-ai-usage: total reported = ${totalReported} calls`)
    return { statusCode: 200 }
  } catch (e) {
    console.error('sync-stripe-ai-usage error:', e)
    return { statusCode: 500 }
  }
}
