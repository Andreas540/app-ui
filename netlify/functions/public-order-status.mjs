// netlify/functions/public-order-status.mjs
// GET /api/public-order-status?order_id=UUID
// Public endpoint — no app auth. Returns minimal order info for the
// customer-facing payment confirmation page (/order-paid/:orderId).

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' })

  try {
    const { neon }       = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const order_id = (event.queryStringParameters || {}).order_id
    if (!order_id) return resp(400, { error: 'order_id required' })

    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_session_id text`.catch(() => {})

    const rows = await sql`
      SELECT
        o.id, o.order_no, o.tenant_id, o.customer_id, o.checkout_session_id,
        SUM(oi.qty * oi.unit_price)::numeric                                                        AS total_amount,
        COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.order_id = o.id), 0)::numeric     AS paid_amount,
        c.name  AS customer_name,
        t.name  AS tenant_name,
        t.app_icon_192 AS tenant_icon
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN tenants   t ON t.id = o.tenant_id
      WHERE o.id = ${order_id}::uuid
      GROUP BY o.id, o.order_no, o.tenant_id, o.customer_id, o.checkout_session_id, c.name, t.name, t.app_icon_192
      LIMIT 1
    `
    if (!rows.length) return resp(404, { error: 'Order not found' })
    const r = rows[0]

    let paidAmount = Number(r.paid_amount)

    // ── Stripe fallback: verify directly if no payment recorded yet ──────────
    if (paidAmount === 0 && r.checkout_session_id) {
      const stripeRows = await sql`
        SELECT secret_key FROM tenant_payment_providers
        WHERE tenant_id = ${r.tenant_id} AND provider = 'stripe' AND enabled = true
          AND secret_key IS NOT NULL
        LIMIT 1
      `.catch(() => [])

      if (stripeRows.length) {
        const Stripe  = (await import('stripe')).default
        const stripe  = new Stripe(stripeRows[0].secret_key)
        const session = await stripe.checkout.sessions.retrieve(r.checkout_session_id).catch(() => null)

        if (session?.payment_status === 'paid') {
          const amount = (session.amount_total ?? 0) / 100
          // Record the payment so subsequent checks hit the DB
          await sql`
            INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
            VALUES (${r.tenant_id}, ${r.customer_id}, ${order_id}::uuid, ${amount}, 'stripe',
              ${new Date().toISOString().slice(0, 10)},
              ${'Stripe ' + (session.payment_intent || r.checkout_session_id)})
          `.catch(() => {}) // ignore duplicate if webhook already recorded it
          paidAmount = amount
        }
      }
    }

    return resp(200, {
      order_no:      r.order_no,
      total_amount:  Number(r.total_amount),
      paid_amount:   paidAmount,
      customer_name: r.customer_name,
      tenant_name:   r.tenant_name,
      tenant_icon:   r.tenant_icon || null,
    })
  } catch (e) {
    console.error('public-order-status error:', e)
    return resp(500, { error: String(e?.message || e) })
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
    },
    body: JSON.stringify(body),
  }
}
