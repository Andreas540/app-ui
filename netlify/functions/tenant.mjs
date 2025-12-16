// netlify/functions/tenant.mjs
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getTenant(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getTenant(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const tenantId = authz.tenantId

    // Get tenant info
    const tenants = await sql`
      SELECT id, name, created_at
      FROM tenants
      WHERE id = ${tenantId}
      LIMIT 1
    `

    if (tenants.length === 0) {
      return cors(404, { error: 'Tenant not found' })
    }

    return cors(200, { 
      tenant: {
        id: tenants[0].id,
        name: tenants[0].name
      }
    })
  } catch (e) {
    console.error('getTenant error:', e)
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