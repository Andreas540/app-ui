// netlify/functions/create-order-payment-link.mjs
// POST /api/create-order-payment-link
// { order_id }
// Creates a payment link for an order. Uses Stripe if configured, AMP Payments otherwise.
// Returns { checkout_url, provider } for the tenant to share with their customer.

import { resolveAuthz } from './utils/auth.mjs'
import { createHmac }   from 'crypto'

const EG_PTK_URL = 'https://postransactions.com/cnp/getptk.php'
const EG_CNP_URL = 'https://postransactions.com/cnp/cnp'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const { order_id } = JSON.parse(rawBody)
    if (!order_id) return cors(400, { error: 'order_id is required' })

    // Fetch order — aggregate all items into a single row, subtract already paid
    const orderRows = await sql`
      SELECT
        o.id, o.order_no, o.customer_id,
        SUM(oi.qty * oi.unit_price)::numeric AS total_amount,
        COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.order_id = o.id AND py.tenant_id = o.tenant_id), 0)::numeric AS paid_amount,
        string_agg(DISTINCT p.name, ', ' ORDER BY p.name) AS product_names,
        cu.name AS customer_name,
        cu.email AS customer_email,
        'USD' AS currency
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN customers cu ON cu.id = o.customer_id
      WHERE o.id = ${order_id}::uuid AND o.tenant_id = ${authz.tenantId}::uuid
      GROUP BY o.id, o.order_no, o.customer_id, cu.name, cu.email
      LIMIT 1
    `
    if (!orderRows.length) return cors(404, { error: 'Order not found' })
    const order = orderRows[0]

    const totalAmount    = Number(order.total_amount)
    const paidAmount     = Number(order.paid_amount)
    const amount         = Math.round((totalAmount - paidAmount) * 100) / 100
    if (amount <= 0) return cors(400, { error: 'Order is already fully paid' })

    const appBase = `https://${event.headers['x-forwarded-host'] || event.headers.host}`

    // ── Try Stripe first ──────────────────────────────────────────────────────
    const stripeRows = await sql`
      SELECT secret_key FROM tenant_payment_providers
      WHERE tenant_id = ${authz.tenantId}::uuid AND provider = 'stripe' AND enabled = true
        AND secret_key IS NOT NULL
      LIMIT 1
    `
    if (stripeRows.length) {
      const Stripe  = (await import('stripe')).default
      const stripe  = new Stripe(stripeRows[0].secret_key)
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency:     order.currency.toLowerCase(),
            product_data: { name: order.product_names || `Order #${order.order_no}` },
            unit_amount:  Math.round(amount * 100),
          },
          quantity: 1,
        }],
        ...(order.customer_email ? { customer_email: order.customer_email } : {}),
        metadata: { type: 'order', order_id: order.id, tenant_id: authz.tenantId },
        success_url: `${appBase}/order-paid/${order.id}`,
        cancel_url:  `${appBase}/order-paid/${order.id}?canceled=1`,
      })
      // Store session ID so the confirmation page can verify payment without a webhook
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_session_id text`.catch(() => {})
      await sql`UPDATE orders SET checkout_session_id = ${session.id} WHERE id = ${order_id}::uuid AND tenant_id = ${authz.tenantId}::uuid`.catch(() => {})

      return cors(200, { checkout_url: session.url, provider: 'stripe' })
    }

    // ── Fall back to AMP Payments ─────────────────────────────────────────────
    // publishable_key = EG account number, secret_key = EG API key,
    // webhook_secret  = HMAC signing secret for callback verification
    const ampRows = await sql`
      SELECT publishable_key AS account, secret_key AS apikey, webhook_secret AS callback_secret
      FROM tenant_payment_providers
      WHERE tenant_id = ${authz.tenantId}::uuid AND provider = 'amp' AND enabled = true
        AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
      LIMIT 1
    `
    if (!ampRows.length) {
      return cors(400, { error: 'No payment provider is configured or enabled for this tenant' })
    }
    const { account, apikey, callback_secret } = ampRows[0]

    // Sign orderId:tenantId so the callback can be authenticated without DB state
    const sig = callback_secret
      ? createHmac('sha256', callback_secret)
          .update(`${order.id}:${authz.tenantId}`)
          .digest('hex')
      : null

    const ptkRes = await fetch(EG_PTK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({
        account,
        method:      'creditsale',
        amount,
        ticketid:    `ORD-${order.order_no}`,
        paysource:   'INTERNET',
        notes:       `Order #${order.order_no}`,
        successurl:  `${appBase}/order-paid/${order.id}`,
        failureurl:  `${appBase}/order-paid/${order.id}?canceled=1`,
        responseurl: `${appBase}/api/amp-payment-webhook?tenant_id=${authz.tenantId}`,
        ...(sig        ? { extfield1: sig      } : {}),
        extfield2: order.id, // order UUID echoed back for reliable callback lookup
        ...(order.customer_email ? { email: order.customer_email } : {}),
      }),
    })

    const ptkData = await ptkRes.json()
    if (!ptkData.success || !ptkData.data?.ptk) {
      console.error('EG PTK generation failed:', ptkData)
      return cors(502, { error: ptkData.message || 'Failed to generate AMP payment session' })
    }

    return cors(200, { checkout_url: `${EG_CNP_URL}?ptk=${ptkData.data.ptk}`, provider: 'amp' })
  } catch (e) {
    console.error('create-order-payment-link error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
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
