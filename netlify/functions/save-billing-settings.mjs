// netlify/functions/save-billing-settings.mjs
// POST /api/save-billing-settings
// Tenant admin: can only set sms_monthly_cap_amount
// Super admin: can also set sms_price_per_unit and stripe_sms_subscription_item_id

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

    if (authz.role !== 'tenant_admin' && authz.role !== 'super_admin') {
      return cors(403, { error: 'Admin access required' })
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const body = JSON.parse(rawBody)
    const { sms_monthly_cap_amount, sms_price_per_unit, stripe_sms_subscription_item_id } = body

    if (sms_monthly_cap_amount != null && Number(sms_monthly_cap_amount) < 0) {
      return cors(400, { error: 'Cap amount must be 0 or greater' })
    }

    const cap = sms_monthly_cap_amount != null ? Number(sms_monthly_cap_amount) : null

    if (authz.role === 'super_admin') {
      // Super admin can set all fields
      await sql`
        INSERT INTO tenant_billing_settings (
          tenant_id, sms_monthly_cap_amount, sms_price_per_unit,
          stripe_sms_subscription_item_id, updated_at
        ) VALUES (
          ${TENANT_ID},
          ${cap ?? 25.00},
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
    } else {
      // Tenant admin can only set monthly cap
      await sql`
        INSERT INTO tenant_billing_settings (tenant_id, sms_monthly_cap_amount, updated_at)
        VALUES (${TENANT_ID}, ${cap ?? 25.00}, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
          sms_monthly_cap_amount = EXCLUDED.sms_monthly_cap_amount,
          updated_at             = now()
      `
    }

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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
