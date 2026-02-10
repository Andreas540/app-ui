// netlify/functions/super-admin.mjs
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
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

    // Get userId from JWT token
    const userId = getUserIdFromToken(event)
    if (!userId) return cors(403, { error: 'Authentication required' })

    // Check super-admin authorization
    const isSuperAdmin = await checkSuperAdmin(sql, userId)
    if (!isSuperAdmin) return cors(403, { error: 'Super admin access required' })

    const action = new URL(event.rawUrl || `http://x${event.path}`).searchParams.get('action')

    if (action === 'listTenants') {
      const tenants = await sql`
        SELECT id, name, business_type, features, created_at
        FROM tenants
        ORDER BY name ASC
      `
      return cors(200, { tenants })
    }

    if (action === 'listUsers') {
      const users = await sql`
        SELECT 
          u.id,
          u.email,
          u.name,
          array_agg(
            json_build_object(
              'tenant_id', tm.tenant_id,
              'tenant_name', t.name,
              'role', tm.role
            )
          ) FILTER (WHERE tm.tenant_id IS NOT NULL) as tenants
        FROM users u
        LEFT JOIN tenant_memberships tm ON tm.user_id = u.id
        LEFT JOIN tenants t ON t.id = tm.tenant_id
        GROUP BY u.id, u.email, u.name
        ORDER BY u.email ASC
      `
      return cors(200, { users })
    }

    if (action === 'getUserDetails') {
      const userId = new URL(event.rawUrl || `http://x${event.path}`).searchParams.get('userId')
      if (!userId) return cors(400, { error: 'userId required' })

      // Get user info
      const user = await sql`
        SELECT id, email, name
        FROM users
        WHERE id = ${userId}
      `
      if (user.length === 0) return cors(404, { error: 'User not found' })

      // Get user's tenant memberships
      const memberships = await sql`
        SELECT 
          tm.tenant_id,
          t.name as tenant_name,
          tm.role
        FROM tenant_memberships tm
        JOIN tenants t ON t.id = tm.tenant_id
        WHERE tm.user_id = ${userId}
        ORDER BY t.name ASC
      `

      return cors(200, { 
        user: user[0],
        memberships: memberships 
      })
    }

    if (action === 'getTenantFeatures') {
      const tenantId = new URL(event.rawUrl || `http://x${event.path}`).searchParams.get('tenantId')
      if (!tenantId) return cors(400, { error: 'tenantId required' })

      const tenant = await sql`
        SELECT id, name, features
        FROM tenants
        WHERE id = ${tenantId}
      `
      if (tenant.length === 0) return cors(404, { error: 'Tenant not found' })

      return cors(200, { 
        tenant: tenant[0],
        features: tenant[0].features || []
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

    // Get userId from JWT token
    const userId = getUserIdFromToken(event)
    if (!userId) return cors(403, { error: 'Authentication required' })

    // Check super-admin authorization
    const isSuperAdmin = await checkSuperAdmin(sql, userId)
    if (!isSuperAdmin) return cors(403, { error: 'Super admin access required' })

    const body = JSON.parse(event.body || '{}')
    const { action } = body

    if (action === 'createTenant') {
      const { name, businessType } = body
      if (!name || typeof name !== 'string' || !name.trim()) {
        return cors(400, { error: 'Tenant name is required' })
      }

      // Validate business_type
      const validTypes = ['general', 'physical_store']
      const type = businessType && validTypes.includes(businessType) ? businessType : 'general'

      // Generate slug from name
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

      const result = await sql`
        INSERT INTO tenants (name, slug, business_type)
        VALUES (${name.trim()}, ${slug}, ${type})
        RETURNING id, name, slug, business_type
      `

      return cors(201, { tenant: result[0] })
    }

    if (action === 'createUser') {
      const { email, password, name, tenantMemberships } = body

      // Validate inputs
      if (!email || typeof email !== 'string' || !email.trim()) {
        return cors(400, { error: 'Email is required' })
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        return cors(400, { error: 'Password must be at least 8 characters' })
      }
      if (!Array.isArray(tenantMemberships) || tenantMemberships.length === 0) {
        return cors(400, { error: 'At least one tenant membership is required' })
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

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10)

      // Use first tenant as default tenant_id (required for non-super_admin roles)
      const defaultTenantId = tenantMemberships[0].tenant_id

      // Determine role for users table
      const hasTenantAdminRole = tenantMemberships.some(m => m.role === 'tenant_admin')
      const userRole = hasTenantAdminRole ? 'tenant_admin' : 'tenant_user'
      
      const accessLevel = hasTenantAdminRole ? 'admin' : 'inventory'

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
          ${name?.trim() || null}, 
          ${userRole},
          ${accessLevel},
          true, 
          ${defaultTenantId}
        )
        RETURNING id, email, name
      `
      const newUserId = userResult[0].id

      // Create user in app_users table
      await sql`
        INSERT INTO app_users (id, email, is_disabled)
        VALUES (${newUserId}, ${normalizedEmail}, false)
      `

      // Create tenant memberships
      for (const membership of tenantMemberships) {
        const { tenant_id, role } = membership
        if (!tenant_id || !role) continue

        await sql`
          INSERT INTO tenant_memberships (user_id, tenant_id, role)
          VALUES (${newUserId}, ${tenant_id}, ${role})
          ON CONFLICT (user_id, tenant_id) DO NOTHING
        `
      }

      return cors(201, { user: userResult[0] })
    }

    if (action === 'addUserToTenant') {
      const { userId, tenantId, role } = body

      if (!userId || !tenantId || !role) {
        return cors(400, { error: 'userId, tenantId, and role are required' })
      }

      if (!['tenant_admin', 'tenant_user'].includes(role)) {
        return cors(400, { error: 'Role must be tenant_admin or tenant_user' })
      }

      await sql`
        INSERT INTO tenant_memberships (user_id, tenant_id, role)
        VALUES (${userId}, ${tenantId}, ${role})
        ON CONFLICT (user_id, tenant_id) 
        DO UPDATE SET role = EXCLUDED.role
      `

      return cors(200, { success: true })
    }

    if (action === 'removeUserFromTenant') {
      const { userId, tenantId } = body

      if (!userId || !tenantId) {
        return cors(400, { error: 'userId and tenantId are required' })
      }

      await sql`
        DELETE FROM tenant_memberships
        WHERE user_id = ${userId} AND tenant_id = ${tenantId}
      `

      return cors(200, { success: true })
    }

    if (action === 'updateTenantFeatures') {
      const { tenantId, features } = body

      if (!tenantId) {
        return cors(400, { error: 'tenantId is required' })
      }

      if (!Array.isArray(features)) {
        return cors(400, { error: 'features must be an array' })
      }

      // Update tenant features
      await sql`
        UPDATE tenants
        SET features = ${JSON.stringify(features)}::jsonb
        WHERE id = ${tenantId}
      `

      return cors(200, { success: true })
    }

    // Add this BEFORE the final "return cors(400, { error: 'Invalid action' })" line

if (action === 'toggleUserStatus') {
  const { userId, isActive } = body

  if (!userId) {
    return cors(400, { error: 'userId is required' })
  }

  const isActiveBoolean = Boolean(isActive)

  // Update all three columns for complete coverage
  await sql`
    UPDATE users
    SET active = ${isActiveBoolean},
        disabled = ${!isActiveBoolean}
    WHERE id = ${userId}
  `

  await sql`
    UPDATE app_users
    SET is_disabled = ${!isActiveBoolean}
    WHERE id = ${userId}
  `

  return cors(200, { success: true, isActive: isActiveBoolean })
}

    return cors(400, { error: 'Invalid action' })
  } catch (e) {
    console.error('handlePost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// Extract userId from JWT token
function getUserIdFromToken(event) {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return null
    
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return null
    
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return null
    
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded.userId
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
      console.warn('No SUPER_ADMIN_EMAILS configured')
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

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}