// netlify/functions/user-tenants.mjs
import jwt from 'jsonwebtoken'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getUserTenants(event)
  if (event.httpMethod === 'PUT') return setDefaultTenant(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getUserTenants(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    const sql = neon(DATABASE_URL)

    // Get userId from JWT token
    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return cors(403, { error: 'Authentication required' })
    
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return cors(403, { error: 'Token required' })
    
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch {
      return cors(401, { error: 'Invalid token' })
    }

    const userId = decoded.userId

    // Get all tenants this user has access to, plus their saved default
    const [tenants, userRows] = await Promise.all([
      sql`
        SELECT
          t.id,
          t.name,
          COALESCE(t.app_name, t.name) AS display_name,
          tm.role
        FROM tenant_memberships tm
        JOIN tenants t ON t.id = tm.tenant_id
        WHERE tm.user_id = ${userId}
        ORDER BY t.name ASC
      `,
      sql`SELECT default_tenant_id FROM users WHERE id = ${userId} LIMIT 1`,
    ])

    return cors(200, {
      tenants,
      default_tenant_id: userRows[0]?.default_tenant_id ?? null,
    })
  } catch (e) {
    console.error('getUserTenants error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function setDefaultTenant(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    const sql = neon(DATABASE_URL)

    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return cors(403, { error: 'Authentication required' })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    let decoded
    try { decoded = jwt.verify(token, JWT_SECRET) } catch { return cors(401, { error: 'Invalid token' }) }
    const userId = decoded.userId

    const { default_tenant_id } = JSON.parse(event.body || '{}')

    // Validate: must be null or one of the user's own tenants
    if (default_tenant_id !== null && default_tenant_id !== undefined) {
      const membership = await sql`
        SELECT 1 FROM tenant_memberships
        WHERE user_id = ${userId} AND tenant_id = ${default_tenant_id}
        LIMIT 1
      `
      if (membership.length === 0) return cors(403, { error: 'Tenant not accessible' })
    }

    await sql`
      UPDATE users
      SET default_tenant_id = ${default_tenant_id ?? null}
      WHERE id = ${userId}
    `

    return cors(200, { ok: true })
  } catch (e) {
    console.error('setDefaultTenant error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}