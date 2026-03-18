// netlify/functions/get-booking-integration.mjs
// GET /api/get-booking-integration
// Returns the current provider connection status for the tenant.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getIntegration(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getIntegration(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const rows = await sql`
      SELECT
        id,
        provider,
        connection_status,
        external_account_id,
        external_account_name,
        currency,
        country,
        last_sync_at,
        onboarding_completed_at,
        created_at,
        updated_at
      FROM provider_connections
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY created_at DESC
      LIMIT 10
    `

    return cors(200, { connections: rows })
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
