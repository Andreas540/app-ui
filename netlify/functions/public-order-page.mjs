// netlify/functions/public-order-page.mjs
// Public general order page — no customer token required.
// Access is controlled by: active flag, optional geo restriction, optional password.
//
// GET  ?slug=:slug[&session=:token]
//   → { ok, requires_password?, tenant_name, tenant_icon, tenant_language, tenant_currency, products? }
//
// POST { action: 'auth', slug, password }
//   → { ok, session_token }
//
// POST { action: 'order', slug, session?, items, name, email, phone, notes? }
//   → { ok, order_no, order_id } or { checkout_url, order_id, order_no }

import crypto from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')  return handleGet(event)
  if (event.httpMethod === 'POST') return handlePost(event)
  return cors(405, { error: 'Method not allowed' })
}

// ── Session token (HMAC-signed, per-slug) ─────────────────────────────────────

const SESSION_SECRET = process.env.ORDER_PAGE_SECRET || process.env.CUSTOMER_TOKEN_SECRET || 'fallback-secret'

function signSessionToken(payload) {
  const data = JSON.stringify(payload)
  const b64  = Buffer.from(data).toString('base64url')
  const sig  = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url')
  return `${b64}.${sig}`
}

function verifySessionToken(token, expectedSlug) {
  if (!token) return null
  const parts = String(token).split('.')
  if (parts.length !== 2) return null
  const [b64, sig] = parts
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url')
  const aa = Buffer.from(sig); const bb = Buffer.from(expectedSig)
  if (aa.length !== bb.length || !crypto.timingSafeEqual(aa, bb)) return null
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
    if (payload.slug !== expectedSlug) return null
    if (Date.now() / 1000 > payload.exp) return null
    return payload
  } catch { return null }
}

// ── Password hashing ──────────────────────────────────────────────────────────

function hashPassword(tenantId, password) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`${tenantId}:${password}`).digest('hex')
}

// ── Geo check (IP-based, uses ipapi.co free tier) ─────────────────────────────

async function checkGeo(event, geoCountries, geoStates) {
  if (!geoCountries || geoCountries.length === 0) return { allowed: true }
  const ip = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || '').split(',')[0].trim()
  if (!ip || ip === '127.0.0.1' || ip === '::1') return { allowed: true } // localhost always allowed
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`)
    if (!res.ok) return { allowed: true } // fail open if geo API is down
    const geo = await res.json()
    const country = (geo.country_code || '').toUpperCase()
    if (!geoCountries.map(c => c.toUpperCase()).includes(country)) {
      return { allowed: false, country }
    }
    // US state restriction
    if (country === 'US' && geoStates && geoStates.length > 0) {
      const region = (geo.region_code || '').toUpperCase()
      if (!geoStates.map(s => s.toUpperCase()).includes(region)) {
        return { allowed: false, country, region }
      }
    }
    return { allowed: true, country }
  } catch {
    return { allowed: true } // fail open on error
  }
}

// ── Load config + products ────────────────────────────────────────────────────

async function loadConfig(sql, slug) {
  const rows = await sql`
    SELECT c.*, t.id AS tenant_id, t.name AS tenant_name, t.app_icon_192, t.default_language, t.default_currency, t.default_timezone
    FROM order_page_config c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.slug = ${slug}
    LIMIT 1
  `
  return rows[0] ?? null
}

async function loadProducts(sql, tenantId) {
  return sql`
    SELECT
      p.id,
      p.name,
      COALESCE(op.display_price, p.price_amount)::float8  AS price_amount,
      COALESCE(op.display_qty, p.available_quantity)      AS available_qty,
      COALESCE(op.is_visible, true)                       AS is_visible,
      op.label_text,
      op.label_image_data,
      (p.image_data IS NOT NULL AND p.image_data != '')   AS has_image,
      EXTRACT(EPOCH FROM p.image_updated_at)::bigint      AS image_version
    FROM products p
    LEFT JOIN order_page_products op
      ON op.product_id = p.id AND op.tenant_id = p.tenant_id
    WHERE p.tenant_id   = ${tenantId}::uuid
      AND p.category    = 'product'
      AND p.price_amount IS NOT NULL
      AND COALESCE(op.is_visible, true) = true
    ORDER BY COALESCE(op.sort_order, 0) ASC, p.name ASC
  `
}

// ── GET ───────────────────────────────────────────────────────────────────────

async function handleGet(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql  = neon(process.env.DATABASE_URL)
  const qs   = event.queryStringParameters || {}
  const slug = (qs.slug || '').trim()

  if (!slug) return cors(400, { error: 'slug required' })

  try {
    const cfg = await loadConfig(sql, slug)
    if (!cfg) return cors(404, { error: 'not_found' })
    if (!cfg.is_active) return cors(403, { error: 'inactive' })

    // Geo check
    const geo = await checkGeo(event, cfg.geo_countries, cfg.geo_states)
    if (!geo.allowed) return cors(403, { error: 'geo_blocked', country: geo.country, region: geo.region })

    const base = {
      ok: true,
      tenant_name:     cfg.tenant_name,
      tenant_icon:     cfg.app_icon_192 ?? null,
      tenant_language: cfg.default_language ?? null,
      tenant_currency: cfg.default_currency ?? null,
    }

    const requiresPassword = !!cfg.password_hash

    // If password protected, verify session token before returning products
    if (requiresPassword) {
      const session = qs.session ? verifySessionToken(qs.session, slug) : null
      if (!session) return cors(200, { ...base, requires_password: true })
    }

    const products = await loadProducts(sql, cfg.tenant_id)
    return cors(200, { ...base, products })
  } catch (e) {
    console.error('public-order-page GET error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

async function handlePost(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON' }) }

  const slug = (body.slug || '').trim()
  if (!slug) return cors(400, { error: 'slug required' })

  try {
    const cfg = await loadConfig(sql, slug)
    if (!cfg) return cors(404, { error: 'not_found' })
    if (!cfg.is_active) return cors(403, { error: 'inactive' })

    const geo = await checkGeo(event, cfg.geo_countries, cfg.geo_states)
    if (!geo.allowed) return cors(403, { error: 'geo_blocked' })

    // ── Auth action ──────────────────────────────────────────────────────────
    if (body.action === 'auth') {
      if (!cfg.password_hash) return cors(400, { error: 'Page is not password protected' })
      const submitted = hashPassword(cfg.tenant_id, String(body.password || ''))
      const isValid = crypto.timingSafeEqual(
        Buffer.from(submitted),
        Buffer.from(cfg.password_hash)
      )
      if (!isValid) return cors(401, { error: 'incorrect_password' })

      const sessionMinutes = cfg.session_minutes || 60
      const token = signSessionToken({
        slug,
        tenant_id: cfg.tenant_id,
        exp: Math.floor(Date.now() / 1000) + sessionMinutes * 60,
      })
      return cors(200, { ok: true, session_token: token })
    }

    // ── Order action ─────────────────────────────────────────────────────────
    if (body.action === 'order') {
      // Verify session if password required
      if (cfg.password_hash) {
        const session = verifySessionToken(body.session, slug)
        if (!session) return cors(401, { error: 'session_required' })
      }

      const items = Array.isArray(body.items) ? body.items : []
      const validItems = items.filter(i => i?.product_id && Number.isInteger(Number(i.qty)) && Number(i.qty) > 0)
      if (validItems.length === 0) return cors(400, { error: 'No valid items' })

      const name  = String(body.name  || '').trim()
      const email = String(body.email || '').trim()
      const phone = String(body.phone || '').trim()
      if (!name) return cors(400, { error: 'name required' })

      const tenantId = cfg.tenant_id

      // Find or create customer by email (or create anonymous if no email)
      let customerId
      if (email) {
        const existing = await sql`
          SELECT id FROM customers
          WHERE tenant_id = ${tenantId}::uuid
            AND email = ${email}
          LIMIT 1
        `
        if (existing.length) {
          customerId = existing[0].id
          // Update name/phone if provided and customer has placeholder name
          const cur = await sql`SELECT name FROM customers WHERE id = ${customerId} LIMIT 1`
          const isTemp = /^Customer #\d+$/.test(cur[0]?.name || '')
          if (name && (isTemp || !cur[0]?.name)) {
            await sql`UPDATE customers SET name = ${name} WHERE id = ${customerId}`.catch(() => {})
          }
          if (phone) {
            await sql`UPDATE customers SET phone = ${phone} WHERE id = ${customerId} AND (phone IS NULL OR phone = '')`.catch(() => {})
          }
        } else {
          const nextNo = await sql`SELECT COALESCE(MAX(customer_no), 0) + 1 AS n FROM customers WHERE tenant_id = ${tenantId}::uuid`
          const customerNo = Number(nextNo[0].n) || 1
          const [newCustomer] = await sql`
            INSERT INTO customers (tenant_id, name, email, phone, customer_no)
            VALUES (${tenantId}::uuid, ${name || `Customer #${customerNo}`}, ${email}, ${phone || null}, ${customerNo})
            RETURNING id
          `
          customerId = newCustomer.id
        }
      } else {
        // No email — create anonymous customer
        const nextNo = await sql`SELECT COALESCE(MAX(customer_no), 0) + 1 AS n FROM customers WHERE tenant_id = ${tenantId}::uuid`
        const customerNo = Number(nextNo[0].n) || 1
        const [newCustomer] = await sql`
          INSERT INTO customers (tenant_id, name, phone, customer_no)
          VALUES (${tenantId}::uuid, ${name}, ${phone || null}, ${customerNo})
          RETURNING id
        `
        customerId = newCustomer.id
      }

      // Next order number
      const nextNo = await sql`SELECT COALESCE(MAX(order_no), 0) + 1 AS n FROM orders WHERE tenant_id = ${tenantId}::uuid`
      const orderNo = Number(nextNo[0].n) || 1

      const tzRows = await sql`SELECT default_timezone FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`.catch(() => [])
      const tz     = tzRows[0]?.default_timezone || 'UTC'
      const today  = new Date().toLocaleString('en-CA', { timeZone: tz }).slice(0, 10)
      const notes  = body.notes ? `From order page: ${String(body.notes).trim()}` : null

      const [hdr] = await sql`
        INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, delivered_quantity, notes)
        VALUES (${tenantId}::uuid, ${customerId}::uuid, ${orderNo}, ${today}, false, 0, ${notes})
        RETURNING id
      `
      const orderId = hdr.id

      for (const item of validItems) {
        const productId = String(item.product_id)
        const qty = Math.max(1, Math.floor(Number(item.qty)))

        const productRows = await sql`
          SELECT
            COALESCE(op.display_price, p.price_amount)::float8 AS price_amount,
            p.cost
          FROM products p
          LEFT JOIN order_page_products op
            ON op.product_id = p.id AND op.tenant_id = p.tenant_id
          WHERE p.id        = ${productId}::uuid
            AND p.tenant_id = ${tenantId}::uuid
            AND p.category  = 'product'
            AND p.price_amount IS NOT NULL
          LIMIT 1
        `
        if (!productRows.length) continue

        const unitPrice = Number(productRows[0].price_amount)
        await sql`
          INSERT INTO order_items (order_id, product_id, qty, unit_price, cost)
          VALUES (${orderId}, ${productId}::uuid, ${qty}, ${unitPrice},
            (SELECT cost FROM products WHERE id = ${productId}::uuid AND tenant_id = ${tenantId}::uuid))
        `
      }

      // Log external event (must await in serverless)
      await sql`
        INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
        VALUES (${tenantId}::uuid, 'order', ${name}, ${JSON.stringify({ order_no: orderNo, order_id: orderId, customer_id: customerId })}::jsonb)
      `.catch(err => console.error('external_events insert failed:', err))

      // Check for Stripe integration
      const totalRows = await sql`SELECT COALESCE(SUM(qty * unit_price), 0)::numeric AS total FROM order_items WHERE order_id = ${orderId}`
      const orderValue = Number(totalRows[0]?.total || 0)

      if (orderValue > 0) {
        const stripeRows = await sql`
          SELECT secret_key FROM tenant_payment_providers
          WHERE tenant_id = ${tenantId}::uuid AND provider = 'stripe' AND enabled = true
            AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
          LIMIT 1
        `.catch(() => [])

        if (stripeRows.length) {
          const Stripe  = (await import('stripe')).default
          const stripe  = new Stripe(stripeRows[0].secret_key)
          const appBase = `https://${event.headers['x-forwarded-host'] || event.headers.host}`

          const customerEmail = email || undefined
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_creation: 'always',
            line_items: [{
              price_data: {
                currency: (cfg.default_currency || 'usd').toLowerCase(),
                product_data: { name: `Order #${orderNo}` },
                unit_amount: Math.round(orderValue * 100),
              },
              quantity: 1,
            }],
            ...(customerEmail ? { customer_email: customerEmail } : {}),
            metadata: { type: 'order', order_id: orderId, tenant_id: tenantId },
            success_url: `${appBase}/order-paid/${orderId}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${appBase}/order/${slug}`,
          })

          await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_session_id text`.catch(() => {})
          await sql`UPDATE orders SET checkout_session_id = ${session.id} WHERE id = ${orderId}`.catch(() => {})

          return cors(200, { checkout_url: session.url, order_id: orderId, order_no: orderNo })
        }
      }

      return cors(201, { ok: true, order_no: orderNo, order_id: orderId })
    }

    return cors(400, { error: 'Unknown action' })
  } catch (e) {
    console.error('public-order-page POST error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

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
