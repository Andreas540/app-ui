// netlify/functions/stripe-payment-webhook.mjs
// POST /api/stripe-payment-webhook?tenant_id=UUID
//
// Receives Stripe webhook events for a specific tenant.
// The tenant registers this URL (with their tenant_id query param) in their
// Stripe dashboard under Developers → Webhooks.
//
// Handles:
//   checkout.session.completed  → confirm booking / record order payment

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' })

  try {
    const { neon }       = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // ── Identify tenant from query param ──────────────────────────────────────
    const tenantId = (event.queryStringParameters || {}).tenant_id
    if (!tenantId) return resp(400, { error: 'tenant_id query param required' })

    // ── Look up tenant's Stripe webhook secret ────────────────────────────────
    const providerRows = await sql`
      SELECT webhook_secret, secret_key
      FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid
        AND provider   = 'stripe'
      LIMIT 1
    `
    if (!providerRows.length || !providerRows[0].webhook_secret) {
      console.error(`No Stripe webhook secret for tenant ${tenantId}`)
      return resp(400, { error: 'Stripe not configured for this tenant' })
    }
    const { webhook_secret, secret_key } = providerRows[0]

    // ── Verify Stripe signature ───────────────────────────────────────────────
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(secret_key)

    const sig = event.headers['stripe-signature']
    if (!sig) return resp(400, { error: 'Missing stripe-signature header' })

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '')

    let stripeEvent
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhook_secret)
    } catch (err) {
      console.error('Stripe signature verification failed:', err.message)
      return resp(400, { error: `Webhook signature invalid: ${err.message}` })
    }

    // ── Route by event type ───────────────────────────────────────────────────
    if (stripeEvent.type === 'checkout.session.completed') {
      const session  = stripeEvent.data.object
      const meta     = session.metadata || {}
      const type     = meta.type           // 'booking' | 'order'
      const paymentIntent = session.payment_intent

      if (type === 'booking') {
        const bookingId = meta.booking_id
        if (!bookingId) return resp(400, { error: 'booking_id missing from metadata' })

        await sql`
          UPDATE bookings
          SET booking_status = 'confirmed',
              payment_status = 'paid',
              updated_at     = now()
          WHERE id        = ${bookingId}::uuid
            AND tenant_id = ${tenantId}::uuid
            AND booking_status = 'pending_payment'
        `

        // Create order from booking (order is only created here, after payment confirmed)
        const bkRows = await sql`
          SELECT b.customer_id, b.service_id, b.total_amount,
                 COALESCE(t.default_timezone, 'UTC') AS tz,
                 to_char(NOW() AT TIME ZONE COALESCE(t.default_timezone,'UTC'), 'YYYY-MM-DD') AS order_date
          FROM bookings b
          JOIN tenants t ON t.id = b.tenant_id
          WHERE b.id = ${bookingId}::uuid AND b.tenant_id = ${tenantId}::uuid
          LIMIT 1
        `
        let orderId = null
        if (bkRows.length) {
          const bk = bkRows[0]
          const amountPaid = session.amount_total != null
            ? session.amount_total / 100
            : Number(bk.total_amount)

          // Idempotency: skip if order already exists for this booking
          const existingOrder = await sql`
            SELECT id FROM orders WHERE booking_id = ${bookingId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1
          `
          if (!existingOrder.length) {
            const counterRow = await sql`
              INSERT INTO tenant_order_counters (tenant_id, last_order_no)
              VALUES (${tenantId}, (SELECT COALESCE(MAX(order_no),0)+1 FROM orders WHERE tenant_id=${tenantId}))
              ON CONFLICT (tenant_id) DO UPDATE
                SET last_order_no = GREATEST(EXCLUDED.last_order_no, tenant_order_counters.last_order_no + 1)
              RETURNING last_order_no
            `
            const orderRow = await sql`
              INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, booking_id)
              VALUES (${tenantId}, ${bk.customer_id}, ${counterRow[0].last_order_no}, ${bk.order_date}, FALSE, ${bookingId})
              RETURNING id
            `
            orderId = orderRow[0].id
            await sql`
              INSERT INTO order_items (order_id, product_id, qty, unit_price)
              VALUES (${orderId}, ${bk.service_id}, 1, ${amountPaid})
            `
            console.log(`Created order ${orderId} for booking ${bookingId}`)
          } else {
            orderId = existingOrder[0].id
          }

          await sql`
            INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
            VALUES (
              ${tenantId}::uuid, ${bk.customer_id}, ${orderId}::uuid, ${amountPaid},
              'stripe', ${new Date().toLocaleString('en-CA', { timeZone: bk.tz }).slice(0, 10)},
              ${'Stripe booking ' + (paymentIntent || session.id)}
            )
          `
        }

        console.log(`Booking ${bookingId} confirmed (Stripe payment ${paymentIntent})`)

      } else if (type === 'order') {
        const orderId = meta.order_id
        if (!orderId) return resp(400, { error: 'order_id missing from metadata' })

        // Fetch order to get customer_id and amount
        const orderRows = await sql`
          SELECT o.id, o.customer_id, o.total_amount,
                 COALESCE(t.default_timezone, 'UTC') AS tz
          FROM orders o
          JOIN tenants t ON t.id = o.tenant_id
          WHERE o.id = ${orderId}::uuid AND o.tenant_id = ${tenantId}::uuid
          LIMIT 1
        `
        if (!orderRows.length) return resp(404, { error: 'Order not found' })
        const order = orderRows[0]

        const amountPaid = session.amount_total != null
          ? session.amount_total / 100
          : Number(order.total_amount)

        // Insert a payment record linked to the order
        await sql`
          INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
          VALUES (
            ${tenantId}::uuid,
            ${order.customer_id},
            ${orderId}::uuid,
            ${amountPaid},
            'stripe',
            ${new Date().toLocaleString('en-CA', { timeZone: order.tz }).slice(0, 10)},
            ${'Stripe checkout ' + (paymentIntent || session.id)}
          )
        `

        console.log(`Order ${orderId} payment recorded (Stripe ${paymentIntent})`)
      }
    }

    return resp(200, { received: true })
  } catch (e) {
    console.error('stripe-payment-webhook error:', e)
    return resp(500, { error: String(e?.message || e) })
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}
