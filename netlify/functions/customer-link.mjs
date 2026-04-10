// netlify/functions/customer-link.mjs
// POST: app auth required — creates a draft customer record and returns a signed share link.
import crypto from 'crypto'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'POST') return createLink(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

// ── Token helpers (must match customer-form.mjs verify) ───────────────────────

function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function generateCustomerToken({ tenantId, customerId, expiresInDays = 30 }) {
  const secret = process.env.CUSTOMER_TOKEN_SECRET
  if (!secret) throw new Error('CUSTOMER_TOKEN_SECRET missing')

  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60
  const payload = { tenant_id: String(tenantId), customer_id: String(customerId), exp }
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const sigB64 = base64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  return `${payloadB64}.${sigB64}`
}

// ── POST /api/customer-link ───────────────────────────────────────────────────

async function createLink(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error }, event)
    const TENANT_ID = String(authz.tenantId)

    const body = JSON.parse(event.body || '{}')

    let name        = body.name         ? String(body.name).trim()         : ''
    let companyName = body.company_name ? String(body.company_name).trim() : ''

    // Assign temporary name "Customer #X" for any empty name fields
    if (!name || !companyName) {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM customers WHERE tenant_id = ${TENANT_ID}::uuid
      `
      const tempName = `Customer #${count + 1}`
      if (!name)        name        = tempName
      if (!companyName) companyName = tempName
    }

    const customerType = body.customer_type ? String(body.customer_type) : 'Direct'
    const shippingCost = body.shipping_cost != null ? Number(body.shipping_cost) : 0
    const phone      = body.phone       ? String(body.phone).trim()       : null
    const address1   = body.address1    ? String(body.address1).trim()    : null
    const address2   = body.address2    ? String(body.address2).trim()    : null
    const city       = body.city        ? String(body.city).trim()        : null
    const state      = body.state       ? String(body.state).trim()       : null
    const postalCode = body.postal_code ? String(body.postal_code).trim() : null
    const country    = body.country     ? String(body.country).trim()     : null

    const [customer] = await sql`
      INSERT INTO customers (
        tenant_id, name, customer_type, shipping_cost,
        company_name, phone, address1, address2,
        city, state, postal_code, country
      ) VALUES (
        ${TENANT_ID}::uuid, ${name}, ${customerType}, ${shippingCost},
        ${companyName}, ${phone}, ${address1}, ${address2},
        ${city}, ${state}, ${postalCode}, ${country}
      )
      RETURNING id
    `

    const token = generateCustomerToken({ tenantId: TENANT_ID, customerId: customer.id })

    // SITE_URL env var takes priority — set it to https://app.biznizoptimizer.com in Netlify.
    // Falls back to the request host so dev/staging still produce working links.
    const host    = event?.headers?.host
    const proto   = String(event?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim()
    const baseUrl = process.env.SITE_URL
      ? String(process.env.SITE_URL).replace(/\/$/, '')
      : host ? `${proto}://${host}` : process.env.URL ? String(process.env.URL) : ''
    if (!baseUrl) return cors(500, { error: 'Could not determine baseUrl' }, event)

    const lang = body.lang ? String(body.lang) : ''
    const url  = `${baseUrl}/customer-form/${encodeURIComponent(token)}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`

    return cors(200, { ok: true, url, customer_id: customer.id, name }, event)
  } catch (e) {
    console.error('customer-link createLink error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

function cors(status, body, _event) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
