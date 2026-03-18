// netlify/functions/sync-stripe-sms-usage.mjs
// Netlify scheduled function — runs hourly.
// For each tenant with a Stripe SMS subscription item, reports unreported
// billable SMS jobs to Stripe metered billing and marks them stripe_reported=true.
// Also upserts usage_snapshots_monthly for the current period.

export const config = {
  schedule: '0 * * * *', // every hour
}

export async function handler() {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, STRIPE_SECRET_KEY } = process.env

    if (!DATABASE_URL) { console.error('DATABASE_URL missing'); return { statusCode: 500 } }
    if (!STRIPE_SECRET_KEY) {
      console.log('STRIPE_SECRET_KEY not set — Stripe usage sync skipped')
      return { statusCode: 200 }
    }

    const sql = neon(DATABASE_URL)

    // Find tenants with Stripe item configured that have unreported billable jobs
    const tenants = await sql`
      SELECT
        tbs.tenant_id,
        tbs.stripe_sms_subscription_item_id,
        tbs.sms_price_per_unit,
        COUNT(mj.id)::int AS pending_count
      FROM tenant_billing_settings tbs
      INNER JOIN message_jobs mj
        ON mj.tenant_id = tbs.tenant_id
        AND mj.billable = true
        AND mj.stripe_reported = false
        AND mj.status IN ('accepted', 'sent', 'delivered')
      WHERE tbs.stripe_sms_subscription_item_id IS NOT NULL
      GROUP BY tbs.tenant_id, tbs.stripe_sms_subscription_item_id, tbs.sms_price_per_unit
    `

    if (!tenants.length) {
      console.log('sync-stripe-sms-usage: no pending billable jobs')
      return { statusCode: 200 }
    }

    let totalReported = 0

    for (const tenant of tenants) {
      const { tenant_id, stripe_sms_subscription_item_id, pending_count, sms_price_per_unit } = tenant

      try {
        // Report batch quantity to Stripe metered subscription item
        const stripeBody = new URLSearchParams({
          quantity: String(pending_count),
          timestamp: String(Math.floor(Date.now() / 1000)),
          action: 'increment',
        })

        const stripeRes = await fetch(
          `https://api.stripe.com/v1/subscription_items/${stripe_sms_subscription_item_id}/usage_records`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            },
            body: stripeBody.toString(),
          }
        )

        const stripeData = await stripeRes.json()

        if (!stripeRes.ok) {
          console.error(`Stripe usage report failed for tenant ${tenant_id}:`, stripeData.error?.message)
          continue
        }

        // Mark all pending jobs as reported
        await sql`
          UPDATE message_jobs
          SET stripe_reported = true, updated_at = now()
          WHERE tenant_id = ${tenant_id}
            AND billable = true
            AND stripe_reported = false
            AND status IN ('accepted', 'sent', 'delivered')
        `

        // Upsert usage_snapshots_monthly for current period
        const periodStart = new Date()
        periodStart.setDate(1)
        periodStart.setHours(0, 0, 0, 0)

        const periodEnd = new Date(periodStart)
        periodEnd.setMonth(periodEnd.getMonth() + 1)
        periodEnd.setDate(0) // last day of month

        const billedAmount = (pending_count * Number(sms_price_per_unit)).toFixed(4)

        await sql`
          INSERT INTO usage_snapshots_monthly (
            tenant_id, period_start, period_end,
            sms_billable_count, sms_billed_amount
          ) VALUES (
            ${tenant_id},
            ${periodStart.toISOString().slice(0, 10)},
            ${periodEnd.toISOString().slice(0, 10)},
            ${pending_count},
            ${billedAmount}
          )
          ON CONFLICT (tenant_id, period_start) DO UPDATE SET
            sms_billable_count = usage_snapshots_monthly.sms_billable_count + EXCLUDED.sms_billable_count,
            sms_billed_amount  = usage_snapshots_monthly.sms_billed_amount  + EXCLUDED.sms_billed_amount
        `

        totalReported += pending_count
        console.log(`Reported ${pending_count} SMS units to Stripe for tenant ${tenant_id}`)
      } catch (tenantErr) {
        console.error(`Error processing tenant ${tenant_id}:`, tenantErr?.message)
      }
    }

    console.log(`sync-stripe-sms-usage: total reported = ${totalReported}`)
    return { statusCode: 200 }
  } catch (e) {
    console.error('sync-stripe-sms-usage error:', e)
    return { statusCode: 500 }
  }
}
