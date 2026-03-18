// netlify/functions/connect-booking-provider.mjs
// POST /api/connect-booking-provider
// Body: { provider, company_login, api_key }
// Validates credentials with SimplyBook and upserts provider_connections row.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return connectProvider(event)
  if (event.httpMethod === 'DELETE') return disconnectProvider(event)
  return cors(405, { error: 'Method not allowed' })
}

async function connectProvider(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { provider, company_login, api_key } = body

    if (!provider) return cors(400, { error: 'provider is required' })
    if (provider !== 'simplybook') return cors(400, { error: 'Unsupported provider' })
    if (!company_login || !api_key) return cors(400, { error: 'company_login and api_key are required' })

    // Validate credentials by fetching a token from SimplyBook
    let token
    try {
      const res = await fetch('https://user-api.simplybook.me/admin/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getToken',
          params: [company_login.trim(), api_key.trim()]
        })
      })

      if (!res.ok) return cors(502, { error: 'Could not reach SimplyBook API' })

      const data = await res.json()
      if (data.error) return cors(401, { error: `SimplyBook rejected credentials: ${data.error.message || data.error}` })
      token = data.result
    } catch (fetchErr) {
      console.error('SimplyBook token fetch failed:', fetchErr)
      return cors(502, { error: 'Failed to reach SimplyBook API' })
    }

    if (!token) return cors(401, { error: 'SimplyBook returned no token — check credentials' })

    // Fetch company info to populate account name/currency/country
    let accountName = company_login
    let currency = null
    let country = null
    try {
      const infoRes = await fetch(`https://user-api.simplybook.me/admin/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Company-Login': company_login.trim(),
          'X-Token': token
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getCompanyInfo',
          params: []
        })
      })
      if (infoRes.ok) {
        const info = await infoRes.json()
        if (info.result) {
          accountName = info.result.name || company_login
          currency = info.result.currency || null
          country = info.result.country_id || null
        }
      }
    } catch (_) {
      // Non-fatal — proceed with what we have
    }

    // Upsert provider_connections row
    // NOTE: token is stored as plain text here.
    // TODO: encrypt with AES-256-GCM before storing (Sprint 6 hardening).
    await sql`
      INSERT INTO provider_connections (
        tenant_id, provider, connection_status,
        external_account_id, external_account_name,
        access_token_encrypted,
        currency, country,
        onboarding_completed_at, updated_at
      ) VALUES (
        ${TENANT_ID}, ${provider}, 'connected',
        ${company_login.trim()}, ${accountName},
        ${token},
        ${currency}, ${country},
        now(), now()
      )
      ON CONFLICT (tenant_id, provider)
        DO UPDATE SET
          connection_status       = 'connected',
          external_account_id     = EXCLUDED.external_account_id,
          external_account_name   = EXCLUDED.external_account_name,
          access_token_encrypted  = EXCLUDED.access_token_encrypted,
          currency                = EXCLUDED.currency,
          country                 = EXCLUDED.country,
          onboarding_completed_at = now(),
          updated_at              = now()
    `

    // Fetch the saved row to return to client
    const rows = await sql`
      SELECT id, provider, connection_status, external_account_name,
             currency, country, last_sync_at, onboarding_completed_at
      FROM provider_connections
      WHERE tenant_id = ${TENANT_ID} AND provider = ${provider}
      LIMIT 1
    `

    return cors(200, { ok: true, connection: rows[0] })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function disconnectProvider(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { provider } = body
    if (!provider) return cors(400, { error: 'provider is required' })

    await sql`
      UPDATE provider_connections
      SET connection_status = 'disconnected',
          access_token_encrypted = null,
          updated_at = now()
      WHERE tenant_id = ${TENANT_ID} AND provider = ${provider}
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
      'access-control-allow-methods': 'POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
