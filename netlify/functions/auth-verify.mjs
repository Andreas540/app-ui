// netlify/functions/auth-verify.mjs
import { checkMaintenance } from './utils/maintenance.mjs'
import jwt from 'jsonwebtoken'

export async function handler(event) {
  // 🔴 FIRST LINE - before any other code
  const maintenanceCheck = checkMaintenance()
  if (maintenanceCheck) return maintenanceCheck

  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'POST') return handleVerify(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleVerify(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET } = process.env
    
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    const body = JSON.parse(event.body || '{}')
    const { token } = body

    if (!token) {
      return cors(400, { error: 'Token required' })
    }

    // Verify JWT token
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return cors(401, { error: 'Token expired' })
      }
      return cors(401, { error: 'Invalid token' })
    }

    const sql = neon(DATABASE_URL)

    // Check for active tenant from header (for tenant switching)
    const activeTenantId = 
      event.headers['x-active-tenant'] || 
      event.headers['X-Active-Tenant'] ||
      null

    // If active tenant specified, get user data for that tenant
    if (activeTenantId) {
      // Verify user has access to this tenant
      const membership = await sql`
        SELECT 
          tm.tenant_id,
          tm.role,
          tm.features as user_features,
          t.name as tenant_name,
          t.business_type,
          t.features as tenant_features,
          t.default_language as tenant_default_language,
          t.default_locale as tenant_default_locale,
          t.available_languages as tenant_available_languages
        FROM tenant_memberships tm
        JOIN tenants t ON t.id = tm.tenant_id
        WHERE tm.user_id = ${decoded.userId}::uuid
          AND tm.tenant_id = ${activeTenantId}::uuid
        LIMIT 1
      `

      if (membership.length === 0) {
        return cors(403, { error: 'No access to specified tenant' })
      }

      // Get basic user info
      const users = await sql`
        SELECT 
          u.id,
          u.email,
          u.name,
          u.access_level,
          u.active,
          u.preferred_language,
          u.preferred_locale
        FROM users u
        WHERE u.id = ${decoded.userId}
        LIMIT 1
      `

      if (users.length === 0) {
        return cors(401, { error: 'User not found' })
      }

      const user = users[0]

      if (!user.active) {
        return cors(403, { error: 'Account is disabled' })
      }

      // Calculate effective features: user_features || tenant_features
      const tenantFeatures = membership[0].tenant_features || []
      const userFeatures = membership[0].user_features || null
      const effectiveFeatures = userFeatures !== null 
        ? userFeatures.filter(f => tenantFeatures.includes(f)) // Intersection
        : tenantFeatures // Inherit all

      // Return user info with active tenant context
      return cors(200, {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: membership[0].role,
          accessLevel: user.access_level,
          tenantId: membership[0].tenant_id,
          tenantName: membership[0].tenant_name,
          businessType: membership[0].business_type,
          features: effectiveFeatures,
          preferred_language: user.preferred_language,
          preferred_locale: user.preferred_locale,
          tenant_default_language: membership[0].tenant_default_language,
          tenant_default_locale: membership[0].tenant_default_locale,
          tenant_available_languages: membership[0].tenant_available_languages
        }
      })
    }

    // No active tenant specified - get user's default tenant
    const users = await sql`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.access_level,
        u.tenant_id,
        u.active,
        u.preferred_language,
        u.preferred_locale,
        t.name as tenant_name,
        t.business_type,
        t.features as tenant_features,
        t.default_language as tenant_default_language,
        t.default_locale as tenant_default_locale,
        t.available_languages as tenant_available_languages
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ${decoded.userId}
      LIMIT 1
    `

    if (users.length === 0) {
      return cors(401, { error: 'User not found' })
    }

    const user = users[0]

    // Check if user is still active
    if (!user.active) {
      return cors(403, { error: 'Account is disabled' })
    }

    // Get user's membership for this tenant to check user-specific features
    const membership = await sql`
      SELECT features as user_features
      FROM tenant_memberships
      WHERE user_id = ${user.id}::uuid
        AND tenant_id = ${user.tenant_id}::uuid
      LIMIT 1
    `

    const tenantFeatures = user.tenant_features || []
    const userFeatures = membership.length > 0 ? membership[0].user_features : null
    const effectiveFeatures = userFeatures !== null
      ? userFeatures.filter(f => tenantFeatures.includes(f)) // Intersection
      : tenantFeatures // Inherit all

    // Return user info
    return cors(200, {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accessLevel: user.access_level,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        businessType: user.business_type,
        features: effectiveFeatures,
        preferred_language: user.preferred_language,
        preferred_locale: user.preferred_locale,
        tenant_default_language: user.tenant_default_language,
        tenant_default_locale: user.tenant_default_locale,
        tenant_available_languages: user.tenant_available_languages
      }
    })

  } catch (e) {
    console.error('Verify error:', e)
    return cors(500, { error: 'Verification failed', details: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Active-Tenant',
    },
    body: JSON.stringify(body),
  }
}