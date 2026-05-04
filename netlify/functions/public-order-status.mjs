// netlify/functions/public-order-status.mjs
// GET /api/public-order-status?order_id=UUID&session_id=cs_xxx
// Public — no auth. Returns order payment status for /order-paid/:orderId.
//
// session_id (from Stripe's {CHECKOUT_SESSION_ID} in success_url) allows
// instant payment verification via retrieve() with no search-index delay.
// Falls back to search by metadata when session_id is absent.
// Always runs the Stripe check when session_id is present — this handles
// partial payments where paidAmount > 0 but < total.

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' })

  try {
    const { neon }         = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const { order_id, session_id } = event.queryStringParameters || {}
    if (!order_id) return resp(400, { error: 'order_id required' })

    const rows = await sql`
      SELECT
        o.id, o.order_no, o.tenant_id, o.customer_id,
        SUM(oi.qty * oi.unit_price)::numeric                                                    AS total_amount,
        COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.order_id = o.id), 0)::numeric AS paid_amount,
        c.name         AS customer_name,
        t.name         AS tenant_name,
        t.app_icon_192 AS tenant_icon
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN tenants   t ON t.id = o.tenant_id
      WHERE o.id = ${order_id}::uuid
      GROUP BY o.id, o.order_no, o.tenant_id, o.customer_id, c.name, t.name, t.app_icon_192
      LIMIT 1
    `
    if (!rows.length) return resp(404, { error: 'Order not found' })
    const r = rows[0]

    let paidAmount      = Number(r.paid_amount)
    const totalAmount   = Number(r.total_amount)
    let sessionVerified = false

    // ── Stripe fallback ───────────────────────────────────────────────────────
    // Run when session_id is present (handles partial payments too, since
    // paidAmount > 0 would otherwise skip the check) OR when nothing is paid yet.
    if (session_id || paidAmount < totalAmount) {
      const stripeRows = await sql`
        SELECT secret_key FROM tenant_payment_providers
        WHERE tenant_id = ${r.tenant_id} AND provider = 'stripe' AND enabled = true
          AND secret_key IS NOT NULL
        LIMIT 1
      `.catch(() => [])

      if (stripeRows.length) {
        const Stripe = (await import('stripe')).default
        const stripe = new Stripe(stripeRows[0].secret_key)

        let session = null
        if (session_id) {
          // Direct retrieve — instant, no search-index delay
          const s = await stripe.checkout.sessions.retrieve(session_id).catch(() => null)
          if (s?.payment_status === 'paid') session = s
        } else {
          // Search fallback — ~30s delay, used when session_id not in URL
          const result = await stripe.checkout.sessions.search({
            query: `metadata['order_id']:'${order_id}' AND payment_status:'paid'`,
            limit: 1,
          }).catch(() => null)
          session = result?.data?.[0] ?? null
        }

        if (session) {
          sessionVerified = true
          const amount = (session.amount_total ?? 0) / 100
          await sql`
            INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
            VALUES (
              ${r.tenant_id}, ${r.customer_id}, ${order_id}::uuid, ${amount},
              'stripe', ${new Date().toISOString().slice(0, 10)},
              ${'Stripe ' + (session.payment_intent || session.id)}
            )
          `.catch(() => {}) // silently ignore if webhook already recorded it
          paidAmount += amount
        }
      }
    }

    return resp(200, {
      order_no:         r.order_no,
      total_amount:     totalAmount,
      paid_amount:      paidAmount,
      session_verified: sessionVerified,
      customer_name:    r.customer_name,
      tenant_name:      r.tenant_name,
      tenant_icon:      r.tenant_icon || null,
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
