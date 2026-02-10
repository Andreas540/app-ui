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

    // Check if user is super_admin OR tenant_admin for this tenant
    const isSuperAdmin = await checkSuperAdmin(sql, userId)
    const isTenantAdmin = await checkTenantAdmin(sql, userId, tenantId)
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return cors(403, { error: 'Tenant admin access required' })
    }

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
    tm.features,
    u.active
  FROM users u
  JOIN tenant_memberships tm ON tm.user_id = u.id
  WHERE tm.tenant_id = ${tenantId}
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

    // Check if user is super_admin OR tenant_admin for this tenant
    const isSuperAdmin = await checkSuperAdmin(sql, userId)
    const isTenantAdmin = await checkTenantAdmin(sql, userId, tenantId)
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return cors(403, { error: 'Tenant admin access required' })
    }

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

    // Create new user in tenant
    if (action === 'createUser') {
      const { email, password, name, role, features } = body

      if (!email || typeof email !== 'string' || !email.trim()) {
        return cors(400, { error: 'Email is required' })
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        return cors(400, { error: 'Password must be at least 8 characters' })
      }
      if (!['tenant_admin', 'tenant_user'].includes(role)) {
        return cors(400, { error: 'Invalid role' })
      }

      const normalizedEmail = email.trim().toLowerCase()

      // Check if email already exists in users table
      const existingUser = await sql`
        SELECT id FROM users WHERE email = ${normalizedEmail}
      `
      if (existingUser.length > 0) {
        return cors(400, { error: 'Email already exists' })
      }

      // Check if email already exists in app_users table
      const existingAppUser = await sql`
        SELECT id FROM app_users WHERE email = ${normalizedEmail}
      `
      if (existingAppUser.length > 0) {
        return cors(400, { error: 'Email already exists in app_users' })
      }

      // Get tenant's available features to validate
      const tenant = await sql`
        SELECT features
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `

      const tenantFeatures = tenant[0]?.features || []
      const validFeatures = Array.isArray(features) 
        ? features.filter(f => tenantFeatures.includes(f))
        : tenantFeatures

      // Hash password
      const bcrypt = await import('bcryptjs')
      const hashedPassword = await bcrypt.default.hash(password, 10)

      // Determine access_level based on role
      const accessLevel = 'admin'

      // Create user in users table
      const userResult = await sql`
        INSERT INTO users (
          email, 
          password_hash, 
          name, 
          role, 
          access_level,
          active, 
          tenant_id
        )
        VALUES (
          ${normalizedEmail}, 
          ${hashedPassword}, 
          ${name || null}, 
          ${role},
          ${accessLevel},
          true, 
          ${tenantId}
        )
        RETURNING id, email, name
      `
      const newUserId = userResult[0].id

      // Create user in app_users table
      await sql`
        INSERT INTO app_users (id, email, is_disabled)
        VALUES (${newUserId}, ${normalizedEmail}, false)
      `

      // Create tenant membership with features
      await sql`
        INSERT INTO tenant_memberships (user_id, tenant_id, role, features)
        VALUES (${newUserId}, ${tenantId}, ${role}, ${JSON.stringify(validFeatures)}::jsonb)
      `

      return cors(201, { user: userResult[0] })
    }

    // Add this BEFORE the final "return cors(400, { error: 'Invalid action' })" line

if (action === 'toggleUserStatus') {
  const { userId: targetUserId, isActive } = body

  if (!targetUserId) {
    return cors(400, { error: 'userId is required' })
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

  const isActiveBoolean = Boolean(isActive)

  // Update all three columns for complete coverage
  await sql`
    UPDATE users
    SET active = ${isActiveBoolean},
        disabled = ${!isActiveBoolean}
    WHERE id = ${targetUserId}
  `

  await sql`
    UPDATE app_users
    SET is_disabled = ${!isActiveBoolean}
    WHERE id = ${targetUserId}
  `

  return cors(200, { success: true, isActive: isActiveBoolean })
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

// Check if user is super-admin by email
async function checkSuperAdmin(sql, userId) {
  try {
    const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    
    if (SUPER_ADMIN_EMAILS.length === 0) {
      return false
    }

    const user = await sql`
      SELECT email FROM users WHERE id = ${userId}
    `
    
    if (user.length === 0) return false
    
    return SUPER_ADMIN_EMAILS.includes(user[0].email.toLowerCase())
  } catch (e) {
    console.error('checkSuperAdmin error:', e)
    return false
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
