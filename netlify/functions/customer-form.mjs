// netlify/functions/customer-form.mjs
// Public endpoint — no app auth. Token-gated access to a single customer record.
// GET  ?token=…  — return form data (excludes customer_type and shipping_cost)
// POST { token, ...fields } — update customer with non-blank submitted fields only
import crypto from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'GET')  return getForm(event)
  if (event.httpMethod === 'POST') return submitForm(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

// ── Token helpers (must match customer-link.mjs generator) ────────────────────

function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecodeToString(b64url) {
  const b64 = String(b64url).replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64').toString('utf8')
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

function verifyCustomerToken(token) {
  const secret = process.env.CUSTOMER_TOKEN_SECRET
  if (!secret) return { error: 'CUSTOMER_TOKEN_SECRET missing' }
  if (!token)  return { error: 'Missing token' }

  const parts = String(token).split('.')
  if (parts.length !== 2) return { error: 'Invalid token format' }

  const [payloadB64, sigB64] = parts
  let payloadStr = ''
  try { payloadStr = base64urlDecodeToString(payloadB64) } catch { return { error: 'Invalid token encoding' } }

  let payload
  try { payload = JSON.parse(payloadStr) } catch { return { error: 'Invalid token JSON' } }

  const expectedSig = base64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  if (!safeEqual(expectedSig, sigB64)) return { error: 'Invalid token signature' }

  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp)) return { error: 'Invalid exp' }
  if (Math.floor(Date.now() / 1000) > exp) return { error: 'Token expired' }
  if (!payload?.tenant_id || !payload?.customer_id) return { error: 'Token missing fields' }

  return { tenantId: String(payload.tenant_id), customerId: String(payload.customer_id) }
}

// ── GET /api/customer-form?token=… ───────────────────────────────────────────

async function getForm(event) {
  try {
    const token    = event.queryStringParameters?.token
    const verified = verifyCustomerToken(token)
    if (verified.error) return cors(401, { error: verified.error }, event)

    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    const [rows, tenantRows] = await Promise.all([
      sql`
        SELECT name, company_name, email, phone, address1, address2, city, state, postal_code, country
        FROM customers
        WHERE id        = ${verified.customerId}::uuid
          AND tenant_id = ${verified.tenantId}::uuid
        LIMIT 1
      `,
      sql`
        SELECT name, app_icon_192, default_language FROM tenants WHERE id = ${verified.tenantId}::uuid LIMIT 1
      `,
    ])
    if (rows.length === 0) return cors(404, { error: 'Customer not found' }, event)

    const tenant = tenantRows[0] ?? {}
    // Don't expose auto-generated placeholder names to the customer
    const isTempName = (v) => v && /^Customer #\d+$/.test(String(v))
    const c = rows[0]
    return cors(200, { ok: true, tenant_name: tenant.name ?? '', tenant_icon: tenant.app_icon_192 ?? null, tenant_language: tenant.default_language ?? null, customer: {
      ...c,
      name:         isTempName(c.name)         ? '' : (c.name         ?? ''),
      company_name: isTempName(c.company_name) ? '' : (c.company_name ?? ''),
    }}, event)
  } catch (e) {
    console.error('customer-form getForm error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

// ── POST /api/customer-form ───────────────────────────────────────────────────
// Only non-blank submitted fields override existing values.

async function submitForm(event) {
  try {
    const body     = JSON.parse(event.body || '{}')
    const verified = verifyCustomerToken(body.token)
    if (verified.error) return cors(401, { error: verified.error }, event)

    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    const existing = await sql`
      SELECT name, company_name, email, phone, address1, address2, city, state, postal_code, country
      FROM customers
      WHERE id        = ${verified.customerId}::uuid
        AND tenant_id = ${verified.tenantId}::uuid
      LIMIT 1
    `
    if (existing.length === 0) return cors(404, { error: 'Customer not found' }, event)

    const cur = existing[0]

    // Non-blank submitted value wins; blank submission keeps existing DB value
    const str = (v) => (typeof v === 'string' ? v.trim() : '')
    const pick = (submitted, current) => str(submitted) || current

    const name        = pick(body.name,         cur.name)
    const companyName = pick(body.company_name,  cur.company_name)
    const email       = pick(body.email,         cur.email)
    const phone       = pick(body.phone,         cur.phone)
    const address1    = pick(body.address1,      cur.address1)
    const address2    = pick(body.address2,      cur.address2)
    const city        = pick(body.city,          cur.city)
    const state       = pick(body.state,         cur.state)
    const postalCode  = pick(body.postal_code,   cur.postal_code)
    const country     = pick(body.country,       cur.country)

    await sql`
      UPDATE customers SET
        name         = ${name},
        company_name = ${companyName},
        email        = ${email},
        phone        = ${phone},
        address1     = ${address1},
        address2     = ${address2},
        city         = ${city},
        state        = ${state},
        postal_code  = ${postalCode},
        country      = ${country}
      WHERE id        = ${verified.customerId}::uuid
        AND tenant_id = ${verified.tenantId}::uuid
    `

    // Log external event (fire and forget)
    sql`
      INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
      VALUES (${verified.tenantId}::uuid, 'customer_info', ${name}, NULL)
    `.catch(err => console.error('external_events insert failed:', err))

    return cors(200, { ok: true }, event)
  } catch (e) {
    console.error('customer-form submitForm error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

function cors(status, body, _event) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
