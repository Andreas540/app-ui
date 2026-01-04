// netlify/functions/tenant-admin.mjs
import jwt from 'jsonwebtoken'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'GET') return handleGet(event)
  if (event.httpMethod === 'POST') return handlePost(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleGet(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Get userId and tenantId from JWT token
    const authInfo = getUserAndTenantFromToken(event)
    if (!authInfo) return cors(403, { error: 'Authentication required' })

    const { userId, tenantId } = authInfo

    // Check if user is tenant_admin for this tenant
    const isTenantAdmin = await checkTenantAdmin(sql, userId, tenantId)
    if (!isTenantAdmin) return cors(403, { error: 'Tenant admin access required' })

    const action = new URL(event.rawUrl || `http://x${event.path}`).searchParams.get('action')

    // Get all users in the tenant with their permissions
    if (action === 'getTenantUsers') {
      // Get tenant's available features
      const tenant = await sql`
        SELECT features
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `

      const tenantFeatures = tenant[0]?.features || []

      // Get all users in this tenant
      const users = await sql`
        SELECT 
          u.id,
          u.email,
          u.name,
          tm.role,
          tm.features
        FROM users u
        JOIN tenant_memberships tm ON tm.user_id = u.id
        WHERE tm.tenant_id = ${tenantId}
          AND u.active = true
        ORDER BY u.email ASC
      `

      return cors(200, { 
        users: users,
        tenantFeatures: tenantFeatures
      })
    }

    return cors(400, { error: 'Invalid action' })
  } catch (e) {
    console.error('handleGet error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function handlePost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Get userId and tenantId from JWT token
    const authInfo = getUserAndTenantFromToken(event)
    if (!authInfo) return cors(403, { error: 'Authentication required' })

    const { userId, tenantId } = authInfo

    // Check if user is tenant_admin for this tenant
    const isTenantAdmin = await checkTenantAdmin(sql, userId, tenantId)
    if (!isTenantAdmin) return cors(403, { error: 'Tenant admin access required' })

    const body = JSON.parse(event.body || '{}')
    const { action } = body

    // Update user's features
    if (action === 'updateUserFeatures') {
      const { userId: targetUserId, features } = body

      if (!targetUserId) {
        return cors(400, { error: 'userId is required' })
      }

      if (!Array.isArray(features)) {
        return cors(400, { error: 'features must be an array' })
      }

      // Verify target user is in this tenant
      const membership = await sql`
        SELECT user_id
        FROM tenant_memberships
        WHERE user_id = ${targetUserId}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `

      if (membership.length === 0) {
        return cors(404, { error: 'User not found in this tenant' })
      }

      // Get tenant's available features to validate
      const tenant = await sql`
        SELECT features
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `

      const tenantFeatures = tenant[0]?.features || []

      // Ensure user can only assign features the tenant has
      const validFeatures = features.filter(f => tenantFeatures.includes(f))

      // Update user's features in tenant_memberships
      await sql`
        UPDATE tenant_memberships
        SET features = ${JSON.stringify(validFeatures)}::jsonb
        WHERE user_id = ${targetUserId}
          AND tenant_id = ${tenantId}
      `

      return cors(200, { success: true })
    }

    return cors(400, { error: 'Invalid action' })
  } catch (e) {
    console.error('handlePost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// Extract userId and tenantId from JWT token and headers
function getUserAndTenantFromToken(event) {
  try {
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return null

    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return null

    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return null

    const decoded = jwt.verify(token, JWT_SECRET)

    // Get tenantId from active tenant header or from token
    const tenantId = 
      event.headers['x-active-tenant'] ||
      event.headers['X-Active-Tenant'] ||
      decoded.tenantId

    return {
      userId: decoded.userId,
      tenantId: tenantId
    }
  } catch (e) {
    console.error('Token decode error:', e)
    return null
  }
}

// Check if user is tenant_admin for the specified tenant
async function checkTenantAdmin(sql, userId, tenantId) {
  try {
    const membership = await sql`
      SELECT role
      FROM tenant_memberships
      WHERE user_id = ${userId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `

    if (membership.length === 0) return false

    return membership[0].role === 'tenant_admin'
  } catch (e) {
    console.error('checkTenantAdmin error:', e)
    return false
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
