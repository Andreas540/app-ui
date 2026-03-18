// netlify/functions/save-billing-settings.mjs
// POST /api/save-billing-settings
// Upserts tenant_billing_settings. Tenant admin only.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return saveSettings(event)
  return cors(405, { error: 'Method not allowed' })
}

async function saveSettings(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Only tenant_admin or super_admin may change billing settings
    if (authz.role !== 'tenant_admin' && authz.role !== 'super_admin') {
      return cors(403, { error: 'Admin access required' })
    }

    const body = JSON.parse(event.body || '{}')
    const {
      sms_monthly_cap_amount,
      sms_price_per_unit,
      stripe_sms_subscription_item_id,
    } = body

    if (sms_monthly_cap_amount != null && Number(sms_monthly_cap_amount) < 0) {
      return cors(400, { error: 'Cap amount must be 0 or greater' })
    }

    await sql`
      INSERT INTO tenant_billing_settings (
        tenant_id,
        sms_monthly_cap_amount,
        sms_price_per_unit,
        stripe_sms_subscription_item_id,
        updated_at
      ) VALUES (
        ${TENANT_ID},
        ${sms_monthly_cap_amount != null ? Number(sms_monthly_cap_amount) : 25.00},
        ${sms_price_per_unit != null ? Number(sms_price_per_unit) : 0.0200},
        ${stripe_sms_subscription_item_id ?? null},
        now()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        sms_monthly_cap_amount          = COALESCE(EXCLUDED.sms_monthly_cap_amount, tenant_billing_settings.sms_monthly_cap_amount),
        sms_price_per_unit              = COALESCE(EXCLUDED.sms_price_per_unit, tenant_billing_settings.sms_price_per_unit),
        stripe_sms_subscription_item_id = COALESCE(EXCLUDED.stripe_sms_subscription_item_id, tenant_billing_settings.stripe_sms_subscription_item_id),
        updated_at                      = now()
    `

    return cors(200, { ok: true })
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
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
