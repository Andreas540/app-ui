// netlify/functions/create-portal-session.mjs
import jwt from 'jsonwebtoken'
import Stripe from 'stripe'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return handlePost(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handlePost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY } = process.env

    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })
    if (!STRIPE_SECRET_KEY) return cors(500, { error: 'STRIPE_SECRET_KEY missing' })

    const sql = neon(DATABASE_URL)

    // Auth check
    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return cors(401, { error: 'Authentication required' })

    const token = authHeader.replace(/^Bearer\s+/i, '')
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (e) {
      return cors(401, { error: 'Invalid token' })
    }

    // Get tenantId from header
    const tenantId =
      event.headers['x-active-tenant'] ||
      event.headers['X-Active-Tenant']

    if (!tenantId) return cors(400, { error: 'No active tenant' })

    // Check user is tenant_admin or super_admin for this tenant
    const isSuperAdmin = await checkSuperAdmin(sql, decoded.userId)
    const isTenantAdmin = await checkTenantAdmin(sql, decoded.userId, tenantId)

    if (!isSuperAdmin && !isTenantAdmin) {
      return cors(403, { error: 'Tenant admin access required' })
    }

    // Get stripe_customer_id for this tenant
    const tenant = await sql`
      SELECT stripe_customer_id, name
      FROM tenants
      WHERE id = ${tenantId}
      LIMIT 1
    `

    if (tenant.length === 0) return cors(404, { error: 'Tenant not found' })

    const stripeCustomerId = tenant[0].stripe_customer_id
    if (!stripeCustomerId) {
      return cors(400, { error: 'No Stripe customer linked to this tenant. Contact support.' })
    }

    // Create Stripe portal session
    const stripe = new Stripe(STRIPE_SECRET_KEY)
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const body = JSON.parse(rawBody)
    const returnUrl = body.returnUrl || 'https://data-entry-beta.netlify.app'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    })

    return cors(200, { url: portalSession.url })
  } catch (e) {
    console.error('create-portal-session error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function checkSuperAdmin(sql, userId) {
  try {
    const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    const user = await sql`SELECT email FROM users WHERE id = ${userId}`
    if (user.length === 0) return false
    return SUPER_ADMIN_EMAILS.includes(user[0].email.toLowerCase())
  } catch (e) {
    return false
  }
}

async function checkTenantAdmin(sql, userId, tenantId) {
  try {
    const membership = await sql`
      SELECT role FROM tenant_memberships
      WHERE user_id = ${userId} AND tenant_id = ${tenantId}
      LIMIT 1
    `
    if (membership.length === 0) return false
    return membership[0].role === 'tenant_admin'
  } catch (e) {
    return false
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}