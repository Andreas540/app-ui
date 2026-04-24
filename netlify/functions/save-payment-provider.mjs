// netlify/functions/save-payment-provider.mjs
// POST /api/save-payment-provider
// { provider, publishable_key, secret_key, webhook_secret, enabled }
// Blank string fields are ignored — existing values are kept.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    if (authz.role !== 'tenant_admin' && authz.role !== 'super_admin') {
      return cors(403, { error: 'Admin access required' })
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const body = JSON.parse(rawBody)

    const { provider = 'stripe', publishable_key, secret_key, webhook_secret, enabled } = body

    const validProviders = ['stripe', 'amp']
    if (!validProviders.includes(provider)) {
      return cors(400, { error: 'Invalid provider' })
    }

    await sql`
      CREATE TABLE IF NOT EXISTS tenant_payment_providers (
        id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       uuid        NOT NULL,
        provider        text        NOT NULL DEFAULT 'stripe',
        publishable_key text,
        secret_key      text,
        webhook_secret  text,
        enabled         boolean     NOT NULL DEFAULT false,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id, provider)
      )
    `

    // Insert or update — only overwrite fields that were actually supplied (non-empty string)
    await sql`
      INSERT INTO tenant_payment_providers (tenant_id, provider, publishable_key, secret_key, webhook_secret, enabled, updated_at)
      VALUES (
        ${authz.tenantId},
        ${provider},
        ${publishable_key || null},
        ${secret_key     || null},
        ${webhook_secret || null},
        ${enabled ?? false},
        now()
      )
      ON CONFLICT (tenant_id, provider) DO UPDATE SET
        publishable_key = CASE WHEN ${publishable_key || ''} <> '' THEN EXCLUDED.publishable_key ELSE tenant_payment_providers.publishable_key END,
        secret_key      = CASE WHEN ${secret_key     || ''} <> '' THEN EXCLUDED.secret_key      ELSE tenant_payment_providers.secret_key      END,
        webhook_secret  = CASE WHEN ${webhook_secret || ''} <> '' THEN EXCLUDED.webhook_secret  ELSE tenant_payment_providers.webhook_secret  END,
        enabled         = EXCLUDED.enabled,
        updated_at      = now()
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
