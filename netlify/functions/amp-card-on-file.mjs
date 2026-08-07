// netlify/functions/amp-card-on-file.mjs
// POST /api/amp-card-on-file
// { order_id, token_id }
//
// Charges a stored card token against an order using EPS direct (non-PTK) endpoint.
// Synchronous — result comes back immediately, no polling needed.

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

const EPS_DIRECT_URL = 'https://postransactions.com/cnp/request.php'

export const handler = withErrorLogging('amp-card-on-file', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)

  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf-8')
    : (event.body || '{}')
  const { order_id, token_id } = JSON.parse(rawBody)
  if (!order_id || !token_id) return cors(400, { error: 'order_id and token_id required' })

  // Load AMP credentials
  const ampRows = await sql`
    SELECT publishable_key AS account, secret_key AS apikey
    FROM tenant_payment_providers
    WHERE tenant_id = ${TENANT_ID}::uuid AND provider = 'amp' AND enabled = true
      AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
    LIMIT 1
  `
  if (!ampRows.length) return cors(400, { error: 'AMP not configured' })
  const { account, apikey } = ampRows[0]

  // Load token — verify it belongs to this tenant
  const tokenRows = await sql`
    SELECT token, card_type, last_four, exp_date, customer_id
    FROM customer_payment_tokens
    WHERE id = ${token_id}::uuid AND tenant_id = ${TENANT_ID}::uuid
    LIMIT 1
  `
  if (!tokenRows.length) return cors(404, { error: 'Card token not found' })
  const { token, card_type, last_four, exp_date, customer_id } = tokenRows[0]

  // Load order — remaining unpaid amount
  const orderRows = await sql`
    SELECT o.order_no,
           COALESCE(SUM(oi.qty * oi.unit_price), 0)::float8 AS total_amount,
           COALESCE((
             SELECT SUM(py.amount) FROM payments py
             WHERE py.order_id = o.id AND py.tenant_id = o.tenant_id
           ), 0)::float8 AS paid_amount,
           COALESCE(t.default_timezone, 'UTC') AS tz
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN tenants t ON t.id = o.tenant_id
    WHERE o.id = ${order_id}::uuid AND o.tenant_id = ${TENANT_ID}::uuid
      AND o.customer_id = ${customer_id}
    GROUP BY o.id, o.order_no, t.default_timezone
    LIMIT 1
  `
  if (!orderRows.length) return cors(404, { error: 'Order not found' })
  const { order_no, total_amount, paid_amount, tz } = orderRows[0]

  const amount = Math.round((total_amount - paid_amount) * 100) / 100
  if (amount <= 0) return cors(400, { error: 'Order is already fully paid' })

  // Convert exp_date "MM/YY" or "MM/YYYY" → "MMYY"
  const expirationdate = exp_date
    ? exp_date.replace(/\D/g, '').replace(/^(\d{2})(\d{2,4})$/, (_, mm, yy) => mm + yy.slice(-2))
    : null

  // ticketid max 15 chars
  const ticketid = String(order_no).slice(0, 15)

  const body = {
    method:     'creditsale',
    account,
    userid:     account,
    userId:     account,
    ticketid,
    amount,
    paysource:  'INTERNET',
    token,
    ...(expirationdate ? { expirationdate } : {}),
  }

  const chargeRes = await fetch(EPS_DIRECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify(body),
  })
  const result = await chargeRes.json()

  console.log(`AMP card-on-file order=${order_no}:`, JSON.stringify(result))

  const approved = result.TransactionResult === true || result.TransactionResult === 'true'

  if (!approved) {
    return cors(200, { status: 'declined', message: result.ResponseMsg || 'Card declined' })
  }

  // Record payment
  const transactionId = result.TransactionID || ''
  const authCode      = result.AuthCode || ''
  const approvedAmt   = Number(result.ApprovedAmount) || amount
  const txNotes       = `AMP Card-on-File TxID:${transactionId}${authCode ? ' AuthCode:' + authCode : ''}`
  const payDate       = new Date().toLocaleString('en-CA', { timeZone: tz }).slice(0, 10)

  const existing = await sql`
    SELECT id FROM payments
    WHERE order_id = ${order_id}::uuid AND tenant_id = ${TENANT_ID}::uuid AND notes = ${txNotes}
    LIMIT 1
  `
  if (!existing.length) {
    await sql`
      INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
      VALUES (${TENANT_ID}::uuid, ${customer_id}, ${order_id}::uuid, ${approvedAmt}, 'amp_card_on_file', ${payDate}, ${txNotes})
    `
  }

  console.log(`AMP card-on-file payment recorded: order ${order_no}, TxID ${transactionId}, amount ${approvedAmt}`)

  return cors(200, {
    status:         'approved',
    transaction_id: transactionId,
    auth_code:      authCode,
    card_type,
    last_four,
    amount:         approvedAmt,
  })
})

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
