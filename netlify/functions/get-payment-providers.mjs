// netlify/functions/get-payment-providers.mjs
// GET /api/get-payment-providers
// Returns tenant payment provider config. Never returns secret values.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

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

    const rows = await sql`
      SELECT
        provider,
        publishable_key,
        (secret_key     IS NOT NULL AND secret_key     <> '') AS secret_key_set,
        (webhook_secret IS NOT NULL AND webhook_secret <> '') AS webhook_secret_set,
        enabled
      FROM tenant_payment_providers
      WHERE tenant_id = ${authz.tenantId}
    `

    return cors(200, { providers: rows })
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
