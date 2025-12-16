// netlify/functions/user-create.mjs
import bcrypt from 'bcryptjs'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return createUser(event)
  return cors(405, { error: 'Method not allowed' })
}

async function createUser(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT - only admins can create users
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    if (authz.role !== 'tenant_admin') {
      return cors(403, { error: 'Admin access required' })
    }

    const body = JSON.parse(event.body || '{}')
    const { email, password, name, role, tenant_id } = body

    // Validation
    if (!email || !password) {
      return cors(400, { error: 'Email and password required' })
    }
    if (password.length < 8) {
      return cors(400, { error: 'Password must be at least 8 characters' })
    }

    const emailLower = email.toLowerCase().trim()

    // Check if user already exists
    const existing = await sql`
      SELECT id FROM users 
      WHERE email = ${emailLower}
      LIMIT 1
    `
    if (existing.length > 0) {
      return cors(400, { error: 'User with this email already exists' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Use requesting admin's tenant if not specified
    const targetTenantId = tenant_id || authz.tenantId

    // Insert user
    const result = await sql`
      INSERT INTO users (
        email, password_hash, name, role, tenant_id, active
      ) VALUES (
        ${emailLower},
        ${passwordHash},
        ${name || emailLower},
        ${role || 'user'},
        ${targetTenantId},
        true
      )
      RETURNING id, email, name, role
    `

    const newUser = result[0]

    // Also insert into app_users (for new multi-tenant system)
    await sql`
      INSERT INTO public.app_users (id, email)
      VALUES (${newUser.id}::uuid, ${emailLower})
      ON CONFLICT (id) DO NOTHING
    `

    // Insert tenant membership
    await sql`
      INSERT INTO public.tenant_memberships (user_id, tenant_id, role)
      VALUES (${newUser.id}::uuid, ${targetTenantId}::uuid, ${role || 'tenant_admin'})
      ON CONFLICT (user_id, tenant_id) DO NOTHING
    `

    return cors(201, {
      ok: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      },
      message: 'User created successfully'
    })

  } catch (e) {
    console.error('Create user error:', e)
    return cors(500, { 
      error: 'Failed to create user', 
      details: String(e?.message || e) 
    })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id',
    },
    body: JSON.stringify(body),
  }
}