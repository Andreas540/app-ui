// netlify/functions/auth-login.mjs
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const BLOCKED_EMAILS = new Set(['blvpcnd@gmail.com'])

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'POST') return handleLogin(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleLogin(event) {
  try {
    console.log('=== AUTH LOGIN START ===')
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET } = process.env

    console.log('DATABASE_URL exists:', !!DATABASE_URL)
    console.log('JWT_SECRET exists:', !!JWT_SECRET)

    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    const body = JSON.parse(event.body || '{}')
    const { email, password } = body

    console.log('Login attempt for email:', email)

    if (!email || !password) {
      console.log('Missing email or password')
      return cors(400, { error: 'Email and password required' })
    }

    const emailSearch = email.toLowerCase().trim()

    // HARD BLOCK by email (immediate, no DB dependency)
    if (BLOCKED_EMAILS.has(emailSearch)) {
      console.log('Blocked email attempted login:', emailSearch)
      return cors(403, { error: 'Login Failed' })
    }

    const sql = neon(DATABASE_URL)

    // Find user by email (legacy users table)
    console.log('Searching for email:', emailSearch)

    const users = await sql`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.password_hash,
        u.role,
        u.access_level,
        u.tenant_id,
        u.active,
        t.name as tenant_name,
        t.business_type,
        t.features as tenant_features
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = ${emailSearch}
      LIMIT 1
    `

    console.log('Users found:', users.length)

    if (users.length === 0) {
      console.log('No user found for email:', emailSearch)
      return cors(401, { error: 'Invalid email or password' })
    }

    const user = users[0]
    console.log('User found:', user.email, 'Active:', user.active)

    // Check if user is active (legacy users table)
    if (!user.active) {
      console.log('User account is disabled (users.active = false)')
      return cors(403, { error: 'Login Failed' })
    }

    // ALSO block if disabled in app_users (the table used by resolveAuthz)
    // This prevents "login works but API 403s" mismatch.
    const disabledRows = await sql`
      SELECT is_disabled
      FROM public.app_users
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `
    if (disabledRows.length > 0 && disabledRows[0]?.is_disabled) {
      console.log('User account is disabled (app_users.is_disabled = true)')
      return cors(403, { error: 'Login Failed' })
    }

    // Verify password
    console.log('Verifying password...')
    console.log('Password hash from DB:', user.password_hash.substring(0, 20) + '...')
    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    console.log('Password match:', passwordMatch)

    if (!passwordMatch) {
      console.log('Password verification failed')
      return cors(401, { error: 'Invalid email or password' })
    }

    console.log('Password verified successfully')

    // Update last login
    await sql`
      UPDATE users 
      SET last_login = NOW() 
      WHERE id = ${user.id}
    `

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
    const effectiveFeatures =
      userFeatures !== null
        ? userFeatures.filter((f) => tenantFeatures.includes(f)) // Intersection
        : tenantFeatures // Inherit all

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        accessLevel: user.access_level
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Return user info and token
    return cors(200, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accessLevel: user.access_level,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        businessType: user.business_type,
        features: effectiveFeatures
      }
    })
  } catch (e) {
    console.error('Login error:', e)
    return cors(500, { error: 'Login failed', details: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // include Authorization to be safe for other calls in your app
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(body)
  }
}