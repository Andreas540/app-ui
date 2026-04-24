// netlify/functions/create-order-payment-link.mjs
// POST /api/create-order-payment-link
// { order_id }
// Creates a Stripe Checkout Session for an order's outstanding amount.
// Returns { checkout_url } for the tenant to share with their customer.

import { resolveAuthz } from './utils/auth.mjs'

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

    // Fetch order
    const orderRows = await sql`
      SELECT
        o.id, o.order_no, o.customer_id,
        SUM(oi.qty * oi.unit_price)::numeric AS total_amount,
        p.name AS product_name,
        cu.name AS customer_name,
        cu.email AS customer_email,
        COALESCE(p.currency, 'USD') AS currency
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN customers cu ON cu.id = o.customer_id
      WHERE o.id = ${order_id}::uuid AND o.tenant_id = ${authz.tenantId}::uuid
      GROUP BY o.id, o.order_no, o.customer_id, p.name, cu.name, cu.email, p.currency
      LIMIT 1
    `
    if (!orderRows.length) return cors(404, { error: 'Order not found' })
    const order = orderRows[0]

    const amount = Number(order.total_amount)
    if (!amount || amount <= 0) return cors(400, { error: 'Order has no payable amount' })

    // Fetch tenant's Stripe config
    const stripeRows = await sql`
      SELECT secret_key FROM tenant_payment_providers
      WHERE tenant_id = ${authz.tenantId}::uuid AND provider = 'stripe' AND enabled = true
        AND secret_key IS NOT NULL
      LIMIT 1
    `
    if (!stripeRows.length) return cors(400, { error: 'Stripe is not configured or enabled for this tenant' })

    const Stripe = (await import('stripe')).default
    const stripe  = new Stripe(stripeRows[0].secret_key)
    const appBase = `https://${event.headers['x-forwarded-host'] || event.headers.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency:     order.currency.toLowerCase(),
          product_data: { name: order.product_name || `Order #${order.order_no}` },
          unit_amount:  Math.round(amount * 100),
        },
        quantity: 1,
      }],
      ...(order.customer_email ? { customer_email: order.customer_email } : {}),
      metadata: { type: 'order', order_id: order.id, tenant_id: authz.tenantId },
      success_url: `${appBase}/orders?payment_success=${order.id}`,
      cancel_url:  `${appBase}/orders?payment_canceled=${order.id}`,
    })

    return cors(200, { checkout_url: session.url })
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
