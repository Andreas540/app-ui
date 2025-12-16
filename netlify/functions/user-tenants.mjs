// netlify/functions/user-tenants.mjs
import jwt from 'jsonwebtoken'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getUserTenants(event)
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

    // Get all tenants this user has access to
    const tenants = await sql`
      SELECT 
        t.id,
        t.name,
        tm.role
      FROM tenant_memberships tm
      JOIN tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id = ${userId}
      ORDER BY t.name ASC
    `

    return cors(200, { tenants })
  } catch (e) {
    console.error('getUserTenants error:', e)
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