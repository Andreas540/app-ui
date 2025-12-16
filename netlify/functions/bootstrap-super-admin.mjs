// netlify/functions/bootstrap-super-admin.mjs
import bcrypt from 'bcryptjs'

export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    
    if (!DATABASE_URL) return json(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    
    // Get email and password from query params
    const url = new URL(event.rawUrl || `http://x${event.path}`)
    const email = url.searchParams.get('email')
    const password = url.searchParams.get('password')
    
    if (!email) {
      return json(400, { 
        error: 'Email required',
        usage: 'Call: /api/bootstrap-super-admin?email=your@email.com&password=NewPassword123'
      })
    }
    
    if (!password || password.length < 8) {
      return json(400, { 
        error: 'Password required (min 8 chars)',
        usage: 'Call: /api/bootstrap-super-admin?email=your@email.com&password=NewPassword123'
      })
    }

    // Check if user exists
    const existing = await sql`
      SELECT id, email, active FROM users 
      WHERE email = ${email.toLowerCase().trim()}
    `
    
    if (existing.length === 0) {
      return json(404, { error: 'User not found', email })
    }

    // Hash new password using same method as login
    const hashedPassword = await bcrypt.hash(password, 10)

    // Update password
    await sql`
      UPDATE users 
      SET password_hash = ${hashedPassword},
          active = true
      WHERE email = ${email.toLowerCase().trim()}
    `

    return json(200, { 
      success: true,
      message: 'Password reset successfully! You can now log in.',
      email: existing[0].email,
      active: true,
      warning: 'DELETE netlify/functions/bootstrap-super-admin.mjs NOW for security!'
    })

  } catch (e) {
    console.error('Bootstrap error:', e)
    return json(500, { error: String(e?.message || e) })
  }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }
}