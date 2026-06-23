// netlify/functions/customer-messages.mjs
// Tenant–customer two-way messaging (doorbell pattern).
//
// Auth routing:
//   ?token= / body.token  →  customer (no login), gated by customer_links type='message'
//   Authorization header  →  tenant admin, gated by resolveAuthz
//
// GET   ?token=…                            → customer: thread + tenant display info
// GET   ?customer_id=…                      → admin: thread + customer info + unread count
// POST  { token, body }                     → customer: inbound reply
// POST  { customer_id, body, channels? }    → admin: outbound send (+ optional notifications)
// PATCH { customer_id }                     → admin: mark all unread inbound messages as read

import crypto from 'crypto'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')   return handleGet(event)
  if (event.httpMethod === 'POST')  return handlePost(event)
  if (event.httpMethod === 'PATCH') return handlePatch(event)
  return cors(405, { error: 'Method not allowed' })
}

// ── Link resolution (short DB ID or legacy HMAC JWT) ─────────────────────────

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function base64urlDecode(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64').toString('utf8')
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

function verifyLegacyToken(token) {
  const secret = process.env.CUSTOMER_TOKEN_SECRET
  if (!secret) return { error: 'CUSTOMER_TOKEN_SECRET missing' }
  const parts = String(token).split('.')
  if (parts.length !== 2) return { error: 'Invalid token format' }
  const [payloadB64, sigB64] = parts
  let payload
  try { payload = JSON.parse(base64urlDecode(payloadB64)) } catch { return { error: 'Invalid token' } }
  const expectedSig = base64urlEncode(crypto.createHmac('sha256', secret).update(payloadB64).digest())
  if (!safeEqual(expectedSig, sigB64)) return { error: 'Invalid token signature' }
  if (Math.floor(Date.now() / 1000) > Number(payload?.exp)) return { error: 'Token expired' }
  if (!payload?.tenant_id || !payload?.customer_id) return { error: 'Token missing fields' }
  return { tenantId: String(payload.tenant_id), customerId: String(payload.customer_id) }
}

async function resolveLink(sql, token) {
  if (!token) return { error: 'Missing token' }
  if (String(token).includes('.')) return verifyLegacyToken(token)
  const rows = await sql`
    SELECT tenant_id::text, customer_id::text FROM customer_links
    WHERE id = ${token} AND type = 'message' AND expires_at > now()
    LIMIT 1
  `
  if (!rows.length) return { error: 'Link expired or invalid' }
  return { tenantId: rows[0].tenant_id, customerId: rows[0].customer_id }
}

// ── Get or create a message portal link for a customer ───────────────────────

async function getOrCreateMessageLink(sql, { tenantId, customerId, baseUrl }) {
  const existing = await sql`
    SELECT id FROM customer_links
    WHERE tenant_id = ${tenantId}::uuid
      AND customer_id = ${customerId}::uuid
      AND type = 'message'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
  `
  let linkId
  if (existing.length) {
    linkId = existing[0].id
  } else {
    linkId = crypto.randomBytes(7).toString('base64url')
    await sql`
      INSERT INTO customer_links (id, tenant_id, customer_id, type)
      VALUES (${linkId}, ${tenantId}::uuid, ${customerId}::uuid, 'message')
    `
  }
  return `${baseUrl}/conversation/${linkId}`
}

function getBaseUrl(event) {
  const host  = event?.headers?.host
  const proto = String(event?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim()
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/$/, '')
  if (host) return `${proto}://${host}`
  return process.env.URL ? String(process.env.URL) : ''
}

// ── GET ───────────────────────────────────────────────────────────────────────

async function handleGet(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const qs  = event.queryStringParameters || {}

  // Customer view
  if (qs.token) {
    try {
      const link = await resolveLink(sql, qs.token)
      if (link.error) return cors(401, { error: link.error })

      const [messages, tenantRows] = await Promise.all([
        sql`
          SELECT id, direction, body, created_at
          FROM customer_messages
          WHERE tenant_id   = ${link.tenantId}::uuid
            AND customer_id = ${link.customerId}::uuid
          ORDER BY created_at ASC
        `,
        sql`SELECT name, app_icon_192 FROM tenants WHERE id = ${link.tenantId}::uuid LIMIT 1`,
      ])
      const tenant = tenantRows[0] ?? {}
      return cors(200, { ok: true, tenant_name: tenant.name ?? '', tenant_icon: tenant.app_icon_192 ?? null, messages })
    } catch (e) {
      console.error('customer-messages GET (customer) error:', e)
      return cors(500, { error: String(e?.message || e) })
    }
  }

  // Admin view
  try {
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const tenantId    = authz.tenantId
    const customerId  = qs.customer_id
    if (!customerId) return cors(400, { error: 'customer_id required' })

    const [messages, customerRows] = await Promise.all([
      sql`
        SELECT id, direction, body, sent_by_user_id, created_at, read_at
        FROM customer_messages
        WHERE tenant_id   = ${tenantId}::uuid
          AND customer_id = ${customerId}::uuid
        ORDER BY created_at ASC
      `,
      sql`
        SELECT name, email, phone FROM customers
        WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `,
    ])
    if (!customerRows.length) return cors(404, { error: 'Customer not found' })
    const customer    = customerRows[0]
    const unreadCount = messages.filter(m => m.direction === 'inbound' && !m.read_at).length
    return cors(200, { ok: true, customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone, unread_count: unreadCount, messages })
  } catch (e) {
    console.error('customer-messages GET (admin) error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

async function handlePost(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql  = neon(process.env.DATABASE_URL)
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON' }) }

  // Customer inbound reply
  if (body.token) {
    try {
      const link = await resolveLink(sql, body.token)
      if (link.error) return cors(401, { error: link.error })

      const text = String(body.body ?? '').trim()
      if (!text) return cors(400, { error: 'Message body is required' })

      const [customerRows, tenantRows] = await Promise.all([
        sql`SELECT name FROM customers WHERE id = ${link.customerId}::uuid AND tenant_id = ${link.tenantId}::uuid LIMIT 1`,
        sql`SELECT name FROM tenants WHERE id = ${link.tenantId}::uuid LIMIT 1`,
      ])
      if (!customerRows.length) return cors(404, { error: 'Customer not found' })

      const [msg] = await sql`
        INSERT INTO customer_messages (tenant_id, customer_id, direction, body)
        VALUES (${link.tenantId}::uuid, ${link.customerId}::uuid, 'inbound', ${text})
        RETURNING id
      `

      // Alert the tenant — same external_events pattern used by orders/bookings/customer-form
      sql`
        INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
        VALUES (
          ${link.tenantId}::uuid,
          'customer_message',
          ${customerRows[0].name},
          ${JSON.stringify({ message_id: msg.id })}::jsonb
        )
      `.catch(err => console.error('external_events insert failed:', err))

      return cors(200, { ok: true, message_id: msg.id })
    } catch (e) {
      console.error('customer-messages POST (customer) error:', e)
      return cors(500, { error: String(e?.message || e) })
    }
  }

  // Admin outbound send
  try {
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const tenantId   = authz.tenantId
    const customerId = String(body.customer_id ?? '')
    const text       = String(body.body ?? '').trim()
    const channels   = Array.isArray(body.channels) ? body.channels : []

    if (!customerId) return cors(400, { error: 'customer_id required' })
    if (!text)       return cors(400, { error: 'Message body is required' })

    const [customerRows, tenantRows] = await Promise.all([
      sql`SELECT name, email, phone FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1`,
      sql`SELECT name FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`,
    ])
    if (!customerRows.length) return cors(404, { error: 'Customer not found' })

    const customer   = customerRows[0]
    const tenantName = tenantRows[0]?.name ?? ''

    // Resolve the user sending the message (for sent_by_user_id)
    const { getUserFromToken } = await import('./utils/auth.mjs')
    const appUser = getUserFromToken(event)

    const [msg] = await sql`
      INSERT INTO customer_messages (tenant_id, customer_id, direction, body, sent_by_user_id)
      VALUES (
        ${tenantId}::uuid,
        ${customerId}::uuid,
        'outbound',
        ${text},
        ${appUser?.userId ?? null}
      )
      RETURNING id
    `

    // Get/create the customer's message portal link
    const baseUrl   = getBaseUrl(event)
    const portalUrl = baseUrl ? await getOrCreateMessageLink(sql, { tenantId, customerId, baseUrl }) : null

    // Send notifications — results recorded in customer_message_notifications
    const notificationResults = []
    for (const channel of channels) {
      const result = await sendNotification({ sql, messageId: msg.id, channel, customer, tenantName, text, portalUrl })
      notificationResults.push(result)
    }

    return cors(200, { ok: true, message_id: msg.id, portal_url: portalUrl, notifications: notificationResults })
  } catch (e) {
    console.error('customer-messages POST (admin) error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── PATCH — mark inbound messages as read (admin) ─────────────────────────────

async function handlePatch(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const sql  = neon(process.env.DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    let body
    try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON' }) }
    const customerId = String(body.customer_id ?? '')
    if (!customerId) return cors(400, { error: 'customer_id required' })

    await sql`
      UPDATE customer_messages
      SET read_at = now()
      WHERE tenant_id   = ${authz.tenantId}::uuid
        AND customer_id = ${customerId}::uuid
        AND direction   = 'inbound'
        AND read_at     IS NULL
    `
    return cors(200, { ok: true })
  } catch (e) {
    console.error('customer-messages PATCH error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── Notifier ──────────────────────────────────────────────────────────────────

async function sendNotification({ sql, messageId, channel, customer, tenantName, text, portalUrl }) {
  if (channel === 'sms') {
    // SMS blocked pending Twilio 10DLC campaign approval — log and skip
    console.warn('SMS notifications not yet enabled (10DLC pending)')
    await sql`
      INSERT INTO customer_message_notifications (message_id, channel, status, error)
      VALUES (${messageId}::uuid, 'sms', 'failed', '10DLC campaign not yet approved')
    `.catch(() => {})
    return { channel, status: 'failed', error: '10DLC campaign not yet approved' }
  }

  if (channel === 'email') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('RESEND_API_KEY not configured — email notification skipped')
      return { channel, status: 'skipped' }
    }
    if (!customer.email) {
      return { channel, status: 'skipped', error: 'Customer has no email address' }
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${tenantName} <messages@biznizoptimizer.com>`,
          to:   [customer.email],
          subject: `New message from ${tenantName}`,
          html: `<p>Hi ${customer.name || ''},</p><p>${tenantName} sent you a message:</p><blockquote style="border-left:3px solid #ccc;padding:0 12px;margin:16px 0">${text.replace(/\n/g, '<br>')}</blockquote>${portalUrl ? `<p><a href="${portalUrl}">View the conversation and reply →</a></p>` : ''}`,
        }),
      })
      const resData = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(resData?.message || `Resend ${res.status}`)
      await sql`
        INSERT INTO customer_message_notifications (message_id, channel, status)
        VALUES (${messageId}::uuid, 'email', 'sent')
      `.catch(() => {})
      return { channel, status: 'sent' }
    } catch (err) {
      const errMsg = String(err?.message || err)
      await sql`
        INSERT INTO customer_message_notifications (message_id, channel, status, error)
        VALUES (${messageId}::uuid, 'email', 'failed', ${errMsg})
      `.catch(() => {})
      return { channel, status: 'failed', error: errMsg }
    }
  }

  return { channel, status: 'skipped', error: 'Unknown channel' }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
