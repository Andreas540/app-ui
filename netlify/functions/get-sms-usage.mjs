// netlify/functions/get-sms-usage.mjs
// GET /api/get-sms-usage
// Returns current month SMS stats, billing settings, 6-month history, and recent jobs.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getUsage(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getUsage(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Current month stats
    const monthStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE billable = true)::int                         AS billable_count,
        COUNT(*) FILTER (WHERE billable = true AND stripe_reported = true)::int  AS reported_count,
        COUNT(*) FILTER (WHERE billable = true AND stripe_reported = false)::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'delivered')::int                    AS delivered_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int                       AS failed_count,
        COUNT(*) FILTER (WHERE status = 'queued')::int                       AS queued_count
      FROM message_jobs
      WHERE tenant_id = ${TENANT_ID}
        AND channel = 'sms'
        AND created_at >= date_trunc('month', now())
    `

    // Billing settings
    const settingsRows = await sql`
      SELECT
        sms_price_per_unit,
        sms_monthly_cap_amount,
        stripe_sms_subscription_item_id,
        stripe_subscription_id,
        booking_addon_enabled
      FROM tenant_billing_settings
      WHERE tenant_id = ${TENANT_ID}
      LIMIT 1
    `
    const settings = settingsRows[0] ?? {
      sms_price_per_unit: 0.02,
      sms_monthly_cap_amount: 25.00,
      stripe_sms_subscription_item_id: null,
      stripe_subscription_id: null,
      booking_addon_enabled: false,
    }

    // 6-month history from snapshots
    const history = await sql`
      SELECT period_start, period_end, sms_billable_count, sms_billed_amount, stripe_invoice_id
      FROM usage_snapshots_monthly
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY period_start DESC
      LIMIT 6
    `

    // Recent SMS jobs (last 50)
    const recentJobs = await sql`
      SELECT
        mj.id, mj.status, mj.billable, mj.stripe_reported,
        mj.scheduled_for, mj.sent_at, mj.delivered_at, mj.failed_at,
        mj.error_message, mj.template_key,
        c.name AS customer_name
      FROM message_jobs mj
      LEFT JOIN customers c ON c.id = mj.customer_id
      WHERE mj.tenant_id = ${TENANT_ID} AND mj.channel = 'sms'
      ORDER BY mj.created_at DESC
      LIMIT 50
    `

    const stats = monthStats[0]
    const estimatedCost = (stats.billable_count * Number(settings.sms_price_per_unit)).toFixed(2)
    const capPercent = settings.sms_monthly_cap_amount > 0
      ? Math.min(100, Math.round((Number(estimatedCost) / Number(settings.sms_monthly_cap_amount)) * 100))
      : 0

    return cors(200, {
      current_month: { ...stats, estimated_cost: Number(estimatedCost), cap_percent: capPercent },
      settings,
      history,
      recent_jobs: recentJobs,
    })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
