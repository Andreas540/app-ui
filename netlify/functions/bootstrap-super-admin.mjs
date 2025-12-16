// netlify/functions/bootstrap-super-admin.mjs
// ONE-TIME USE: Creates the first super-admin user
// DELETE THIS FILE AFTER USE for security!

import bcrypt from 'bcryptjs'

export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, SUPER_ADMIN_EMAILS } = process.env
    
    if (!DATABASE_URL) return json(500, { error: 'DATABASE_URL missing' })
    if (!SUPER_ADMIN_EMAILS) return json(500, { error: 'SUPER_ADMIN_EMAILS not configured' })

    const sql = neon(DATABASE_URL)
    
    // Get first email from SUPER_ADMIN_EMAILS
    const firstEmail = SUPER_ADMIN_EMAILS.split(',')[0].trim()
    
    // Check if user already exists
    const existing = await sql`
      SELECT id FROM users WHERE email = ${firstEmail}
    `
    
    if (existing.length > 0) {
      return json(400, { 
        error: 'User already exists', 
        email: firstEmail,
        message: 'You can now log in with this email and password you set'
      })
    }

    // Get password from query param (temporary, for bootstrap only)
    const url = new URL(event.rawUrl || `http://x${event.path}`)
    const password = url.searchParams.get('password')
    
    if (!password || password.length < 8) {
      return json(400, { 
        error: 'Password required (min 8 chars)',
        usage: 'Call: /api/bootstrap-super-admin?password=YourPassword123'
      })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const result = await sql`
      INSERT INTO users (email, password, name)
      VALUES (${firstEmail}, ${hashedPassword}, 'Super Admin')
      RETURNING id, email, name
    `

    // Also create in app_users
    await sql`
      INSERT INTO app_users (id, email, name)
      VALUES (${result[0].id}, ${firstEmail}, 'Super Admin')
      ON CONFLICT (id) DO NOTHING
    `

    return json(200, { 
      success: true,
      message: 'Super admin user created! You can now log in.',
      email: firstEmail,
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