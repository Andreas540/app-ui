// netlify/functions/amp-payment-webhook.mjs
// POST /api/amp-payment-webhook?tenant_id=UUID
//
// Receives Enhanced Gateway (AMP Payments) callback after a customer completes
// the hosted payment form.
//
// Security: extfield1 carries an HMAC-SHA256(callback_secret, orderId:tenantId)
// computed at PTK generation time and echoed back by EG. We recompute and
// compare — mismatch means the request did not originate from EG for this tenant.

import { createHmac } from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' })

  try {
    const { neon }       = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const tenantId = (event.queryStringParameters || {}).tenant_id
    if (!tenantId) return resp(400, { error: 'tenant_id query param required' })

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')

    let payload
    try { payload = JSON.parse(rawBody) } catch { return resp(400, { error: 'Invalid JSON body' }) }

    const {
      TransactionResult,
      TransactionID,
      ApprovedAmount,
      AuthCode,
      ResponseMsg,
      ExtField1: receivedSig,
      ExtField2: entityId,  // booking_id or order_id depending on ExtField3
      ExtField3: entityType, // 'booking' | undefined (undefined = order)
    } = payload

    const isBooking = entityType === 'booking'

    // ── Verify HMAC if callback_secret is configured ──────────────────────────
    const ampRows = await sql`
      SELECT webhook_secret AS callback_secret
      FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid AND provider = 'amp'
      LIMIT 1
    `
    if (ampRows.length && ampRows[0].callback_secret) {
      const expected = createHmac('sha256', ampRows[0].callback_secret)
        .update(`${entityId}:${tenantId}`)
        .digest('hex')
      if (receivedSig !== expected) {
        console.error(`AMP callback HMAC mismatch for tenant ${tenantId}`)
        return resp(401, { error: 'Invalid callback signature' })
      }
    }

    // ── Ignore failed / aborted transactions ─────────────────────────────────
    if (!TransactionResult) {
      console.log(`AMP payment not completed for tenant ${tenantId}: ${ResponseMsg}`)
      return resp(200, { received: true })
    }

    if (!entityId) {
      console.error('AMP callback missing ExtField2 (entity id)')
      return resp(400, { error: 'entity id missing from callback' })
    }

    const amountPaid = Number(ApprovedAmount) || 0
    const txNotes = `AMP Payments TxID:${TransactionID || ''}${AuthCode ? ' AuthCode:' + AuthCode : ''}`

    // ── Booking payment ───────────────────────────────────────────────────────
    if (isBooking) {
      const bkRows = await sql`
        SELECT b.customer_id, b.service_id, b.total_amount,
               to_char(b.start_at AT TIME ZONE COALESCE(t.default_timezone,'UTC'), 'YYYY-MM-DD') AS order_date
        FROM bookings b
        JOIN tenants t ON t.id = b.tenant_id
        WHERE b.id = ${entityId}::uuid AND b.tenant_id = ${tenantId}::uuid
        LIMIT 1
      `
      if (!bkRows.length) return resp(404, { error: 'Booking not found' })
      const bk = bkRows[0]

      await sql`
        UPDATE bookings
        SET booking_status = 'confirmed', payment_status = 'paid', updated_at = now()
        WHERE id = ${entityId}::uuid AND tenant_id = ${tenantId}::uuid
          AND booking_status = 'pending_payment'
      `

      // Create order after payment (idempotent)
      let orderId = null
      const existingOrder = await sql`
        SELECT id FROM orders WHERE booking_id = ${entityId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1
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
          VALUES (${tenantId}, ${bk.customer_id}, ${counterRow[0].last_order_no}, ${bk.order_date}, FALSE, ${entityId})
          RETURNING id
        `
        orderId = orderRow[0].id
        await sql`
          INSERT INTO order_items (order_id, service_id, product_id, qty, unit_price)
          VALUES (${orderId}, ${bk.service_id}, ${bk.service_id}, 1, ${amountPaid})
        `
        console.log(`Created order ${orderId} for booking ${entityId}`)
      } else {
        orderId = existingOrder[0].id
      }

      await sql`
        INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
        VALUES (${tenantId}::uuid, ${bk.customer_id}, ${orderId}::uuid, ${amountPaid}, 'amp',
          ${new Date().toISOString().slice(0, 10)}, ${txNotes})
      `
      console.log(`AMP booking payment recorded: booking ${entityId}, TxID ${TransactionID}`)
      return resp(200, { received: true })
    }

    // ── Order payment ─────────────────────────────────────────────────────────
    const orderRows = await sql`
      SELECT id, customer_id FROM orders
      WHERE id = ${entityId}::uuid AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `
    if (!orderRows.length) return resp(404, { error: 'Order not found' })
    const order = orderRows[0]

    await sql`
      INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
      VALUES (
        ${tenantId}::uuid,
        ${order.customer_id},
        ${entityId}::uuid,
        ${amountPaid},
        'amp',
        ${new Date().toISOString().slice(0, 10)},
        ${txNotes}
      )
    `

    console.log(`AMP payment recorded: order ${entityId}, TxID ${TransactionID}, amount ${amountPaid}`)
    return resp(200, { received: true })
  } catch (e) {
    console.error('amp-payment-webhook error:', e)
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
