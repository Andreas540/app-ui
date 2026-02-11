// netlify/functions/auth-login.mjs
import { checkMaintenance } from './utils/maintenance.mjs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { logActivity } from './utils/activity-logger.mjs'

const BLOCKED_EMAILS = new Set(['blvpcnd@gmail.com'])

export async function handler(event) {
  // 🔴 FIRST LINE - before any other code
  const maintenanceCheck = checkMaintenance()
  if (maintenanceCheck) return maintenanceCheck
  
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'POST') return handleLogin(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleLogin(event) {
  try {
    console.log('=== AUTH LOGIN START ===')
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET, SUPER_ADMIN_EMAILS } = process.env

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

    // Find user by email
    console.log('Searching for email:', emailSearch)

    const users = await sql`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.password_hash,
        u.active
      FROM users u
      WHERE u.email = ${emailSearch}
      LIMIT 1
    `

    console.log('Users found:', users.length)

    if (users.length === 0) {
      console.log('No user found for email:', emailSearch)
      
      // Can't log with userId since user doesn't exist
      // Skip logging for non-existent users
      
      return cors(401, { error: 'Invalid email or password' })
    }

    const user = users[0]
    console.log('User found:', user.email, 'Active:', user.active)

    // Check if user is active (legacy users table)
    if (!user.active) {
      console.log('User account is disabled (users.active = false)')
      return cors(403, { error: 'Login Failed' })
    }

    // ALSO block if disabled in app_users
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
    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    console.log('Password match:', passwordMatch)

    if (!passwordMatch) {
      console.log('Password verification failed')
      
      // Log failed login attempt with userId
      await logActivity({
        sql,
        event,
        action: 'login_failed',
        success: false,
        error: 'Invalid password',
        userId: user.id,  // 🆕 Pass userId directly
        tenantId: null
      })
      
      return cors(401, { error: 'Invalid email or password' })
    }

    console.log('Password verified successfully')

    // Log successful login - pass userId directly since we don't have a token yet
    try {
      console.log('🔍 Starting activity log...')
      
      await logActivity({
        sql,
        event,
        action: 'login_success',
        success: true,
        userId: user.id,  // 🆕 Pass userId directly
        tenantId: null    // 🆕 Don't have tenant yet for login
      })
      
      console.log('✅ Activity logging completed')
    } catch (logErr) {
      console.error('❌ Activity logging ERROR:', logErr)
    }

    // Update last login
    await sql`
      UPDATE users 
      SET last_login = NOW() 
      WHERE id = ${user.id}
    `

    // Check if SuperAdmin
    const adminEmails = SUPER_ADMIN_EMAILS ? SUPER_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : []
    const isSuperAdmin = adminEmails.includes(emailSearch)

    if (isSuperAdmin) {
      console.log('User is SuperAdmin - no tenant required')
      
      // Generate JWT token (identity only)
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      )

      return cors(200, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: 'super_admin',
          tenantId: null,
          tenantName: null,
          businessType: null,
          features: []
        }
      })
    }

    // Get user's memberships from tenant_memberships (NEW multi-tenant system)
    const memberships = await sql`
      SELECT 
        tm.tenant_id::text as tenant_id,
        tm.role,
        tm.features as user_features,
        t.name as tenant_name,
        t.business_type,
        t.features as tenant_features
      FROM tenant_memberships tm
      JOIN tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id = ${user.id}::uuid
      ORDER BY tm.created_at ASC
    `

    console.log('Memberships found:', memberships.length)

    if (memberships.length === 0) {
      console.log('User has no tenant memberships')
      return cors(403, { error: 'No tenant access. Contact administrator.' })
    }

    // Use first membership as default tenant
    const primaryMembership = memberships[0]
    const tenantFeatures = primaryMembership.tenant_features || []
    const userFeatures = primaryMembership.user_features
    const effectiveFeatures =
      userFeatures !== null
        ? userFeatures.filter((f) => tenantFeatures.includes(f))
        : tenantFeatures

    console.log('Primary tenant:', primaryMembership.tenant_name)

    // Generate JWT token (identity only - tenant comes from DB memberships)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    )

    // Return user info and token
    return cors(200, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: primaryMembership.role,
        tenantId: primaryMembership.tenant_id,
        tenantName: primaryMembership.tenant_name,
        businessType: primaryMembership.business_type,
        features: effectiveFeatures
      },
      // Also return all memberships for multi-tenant switching
      memberships: memberships.map(m => ({
        tenantId: m.tenant_id,
        tenantName: m.tenant_name,
        role: m.role
      }))
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(body)
  }
}