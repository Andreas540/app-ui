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
        SELECT id, name, created_at
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
      const { name } = body
      if (!name || typeof name !== 'string' || !name.trim()) {
        return cors(400, { error: 'Tenant name is required' })
      }

      const result = await sql`
        INSERT INTO tenants (name)
        VALUES (${name.trim()})
        RETURNING id, name
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

      // Check if email already exists
      const existing = await sql`
        SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}
      `
      if (existing.length > 0) {
        return cors(400, { error: 'Email already exists' })
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10)

      // Create user in users table
      const userResult = await sql`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES (${email.trim().toLowerCase()}, ${hashedPassword}, ${name?.trim() || null}, 'user', true)
        RETURNING id, email, name
      `
      const newUserId = userResult[0].id

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