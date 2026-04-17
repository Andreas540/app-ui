// netlify/functions/order-form.mjs
// Public endpoint — no app auth. Token-gated customer order form.
//
// GET  ?token=…        → { ok, customer_name, products: [{id, name, price_amount}] }
// POST { token, items: [{product_id, qty}], notes? } → { ok, order_no }

import crypto from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')  return getForm(event)
  if (event.httpMethod === 'POST') return submitForm(event)
  return cors(405, { error: 'Method not allowed' })
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

function verifyToken(token) {
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

// ── GET /api/order-form?token=… ───────────────────────────────────────────────

async function getForm(event) {
  try {
    const token    = event.queryStringParameters?.token
    const verified = verifyToken(token)
    if (verified.error) return cors(401, { error: verified.error })

    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    const [customerRows, products, tenantRows] = await Promise.all([
      sql`
        SELECT name FROM customers
        WHERE id        = ${verified.customerId}::uuid
          AND tenant_id = ${verified.tenantId}::uuid
        LIMIT 1
      `,
      sql`
        SELECT id, name, price_amount::float8 AS price_amount
        FROM products
        WHERE tenant_id    = ${verified.tenantId}::uuid
          AND category     = 'product'
          AND price_amount IS NOT NULL
        ORDER BY name ASC
      `,
      sql`SELECT name, app_icon_192 FROM tenants WHERE id = ${verified.tenantId}::uuid LIMIT 1`,
    ])

    if (customerRows.length === 0) return cors(404, { error: 'Customer not found' })

    const tenant = tenantRows[0] ?? {}
    return cors(200, {
      ok: true,
      customer_name: customerRows[0].name,
      tenant_name: tenant.name ?? '',
      tenant_icon: tenant.app_icon_192 ?? null,
      products,
    })
  } catch (e) {
    console.error('order-form getForm error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── POST /api/order-form ──────────────────────────────────────────────────────

async function submitForm(event) {
  try {
    const body     = JSON.parse(event.body || '{}')
    const verified = verifyToken(body.token)
    if (verified.error) return cors(401, { error: verified.error })

    const items = Array.isArray(body.items) ? body.items : []
    const validItems = items.filter(i => i?.product_id && Number.isInteger(Number(i.qty)) && Number(i.qty) > 0)
    if (validItems.length === 0) return cors(400, { error: 'No valid items' })

    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    // Verify customer belongs to tenant
    const customerRows = await sql`
      SELECT id, name FROM customers
      WHERE id        = ${verified.customerId}::uuid
        AND tenant_id = ${verified.tenantId}::uuid
      LIMIT 1
    `
    if (customerRows.length === 0) return cors(404, { error: 'Customer not found' })
    const customerName = customerRows[0].name

    // Next order number per-tenant
    const nextNo = await sql`
      SELECT COALESCE(MAX(order_no),0) + 1 AS n
      FROM orders
      WHERE tenant_id = ${verified.tenantId}::uuid
    `
    const orderNo = Number(nextNo[0].n) || 1

    const today = new Date().toISOString().slice(0, 10)
    const notes = body.notes ? `From customer: ${String(body.notes).trim()}` : null

    // Create order header
    const hdr = await sql`
      INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, delivered_quantity, notes)
      VALUES (
        ${verified.tenantId}::uuid,
        ${verified.customerId}::uuid,
        ${orderNo},
        ${today},
        false,
        0,
        ${notes}
      )
      RETURNING id
    `
    const orderId = hdr[0].id

    // Insert order items — look up price_amount from products for each
    for (const item of validItems) {
      const productId = String(item.product_id)
      const qty       = Math.max(1, Math.floor(Number(item.qty)))

      const productRows = await sql`
        SELECT price_amount::float8 AS price_amount
        FROM products
        WHERE id        = ${productId}::uuid
          AND tenant_id = ${verified.tenantId}::uuid
          AND category  = 'product'
          AND price_amount IS NOT NULL
        LIMIT 1
      `
      if (productRows.length === 0) continue // skip unknown/invalid products

      const unitPrice = Number(productRows[0].price_amount)

      await sql`
        INSERT INTO order_items (order_id, product_id, qty, unit_price, cost)
        VALUES (
          ${orderId},
          ${productId}::uuid,
          ${qty},
          ${unitPrice},
          (SELECT cost FROM products WHERE id = ${productId}::uuid AND tenant_id = ${verified.tenantId}::uuid)
        )
      `
    }

    // Log external event (fire and forget)
    sql`
      INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
      VALUES (${verified.tenantId}::uuid, 'order', ${customerName}, ${JSON.stringify({ order_no: orderNo })}::jsonb)
    `.catch(err => console.error('external_events insert failed:', err))

    return cors(201, { ok: true, order_no: orderNo })
  } catch (e) {
    console.error('order-form submitForm error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
