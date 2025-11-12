// netlify/functions/auth-verify.mjs
import jwt from 'jsonwebtoken'

export async function handler(event) {
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

    // Get fresh user data from database
    const users = await sql`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.access_level,
        u.tenant_id,
        u.active,
        t.name as tenant_name
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
        tenantName: user.tenant_name
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  }
}