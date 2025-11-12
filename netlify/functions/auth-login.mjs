// netlify/functions/auth-login.mjs
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'POST') return handleLogin(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleLogin(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET } = process.env
    
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    const body = JSON.parse(event.body || '{}')
    const { email, password } = body

    if (!email || !password) {
      return cors(400, { error: 'Email and password required' })
    }

    const sql = neon(DATABASE_URL)

    // Find user by email
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
        t.name as tenant_name
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = ${email.toLowerCase().trim()}
      LIMIT 1
    `

    if (users.length === 0) {
      return cors(401, { error: 'Invalid email or password' })
    }

    const user = users[0]

    // Check if user is active
    if (!user.active) {
      return cors(403, { error: 'Account is disabled' })
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    
    if (!passwordMatch) {
      return cors(401, { error: 'Invalid email or password' })
    }

    // Update last login
    await sql`
      UPDATE users 
      SET last_login = NOW() 
      WHERE id = ${user.id}
    `

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
      { expiresIn: '7d' } // Token valid for 7 days
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
        tenantName: user.tenant_name
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  }
}