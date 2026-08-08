// netlify/functions/amp-terminal-initiate.mjs
// POST /api/amp-terminal-initiate
// { order_id }
//
// Pushes a creditsale request to the EPS cloud so the PAX terminal can pick it up.
// Returns { receipt_id } immediately — caller polls amp-terminal-poll for the result.

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

const EPS_PUSH_URL = 'https://postransactions.com/connect/pushrequest.php'

export const handler = withErrorLogging('amp-terminal-initiate', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)

  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  let order_id
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    ;({ order_id } = JSON.parse(rawBody))
  } catch {
    return cors(400, { error: 'Invalid JSON request' })
  }
  if (!order_id) return cors(400, { error: 'order_id required' })

  // Load AMP credentials + device serial
  const ampRows = await sql`
    SELECT publishable_key AS account, secret_key AS apikey, device_serial
    FROM tenant_payment_providers
    WHERE tenant_id = ${TENANT_ID}::uuid AND provider = 'amp' AND enabled = true
      AND publishable_key IS NOT NULL AND secret_key IS NOT NULL AND device_serial IS NOT NULL
    LIMIT 1
  `
  if (!ampRows.length) return cors(400, { error: 'AMP not configured or PAX device serial missing' })
  const { account, apikey, device_serial } = ampRows[0]

  // Fetch order — remaining unpaid amount
  const orderRows = await sql`
    SELECT
      o.order_no,
      COALESCE(SUM(oi.qty * oi.unit_price), 0)::float8 AS total_amount,
      COALESCE((
        SELECT SUM(py.amount) FROM payments py
        WHERE py.order_id = o.id AND py.tenant_id = o.tenant_id
      ), 0)::float8 AS paid_amount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.id = ${order_id}::uuid AND o.tenant_id = ${TENANT_ID}::uuid
    GROUP BY o.id, o.order_no
    LIMIT 1
  `
  if (!orderRows.length) return cors(404, { error: 'Order not found' })

  const { order_no, total_amount, paid_amount } = orderRows[0]
  const amount = Math.round((total_amount - paid_amount) * 100) / 100
  if (amount <= 0) return cors(400, { error: 'Order is already fully paid' })

  const receiptId = Date.now().toString()
  const appBase = process.env.URL || 'https://app.biznizoptimizer.com'
  const posttourl = `${appBase}/api/amp-terminal-callback?tenant_id=${encodeURIComponent(TENANT_ID)}&receipt_id=${encodeURIComponent(receiptId)}`

  const epsRequest = {
    account:     String(account),
    amount:      amount.toFixed(2),
    device:      String(device_serial),
    ticketId:    String(order_no),
    transType:   'creditsale',
    receiptId,
    userId:      String(account),
    extraField1: 'AMP',
    posttourl,
  }

  console.log('Sending EPS payment request:', JSON.stringify(epsRequest))

  let pushRes
  try {
    pushRes = await fetch(EPS_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify(epsRequest),
    })
  } catch (err) {
    console.error('Unable to connect to EPS pushrequest:', err)
    return cors(502, { error: 'Unable to connect to EPS payment service' })
  }

  let pushData
  try {
    pushData = JSON.parse(await pushRes.text())
  } catch {
    return cors(502, { error: 'Invalid response received from EPS' })
  }

  console.log('EPS pushrequest response:', { httpStatus: pushRes.status, response: pushData })

  if (!pushRes.ok || pushData.success !== true) {
    console.error('EPS pushrequest failed:', pushData)
    return cors(502, { error: pushData.message || 'Failed to send request to terminal' })
  }

  return cors(200, { receipt_id: receiptId, record_id: pushData.RecordId, eps_receipt_id: pushData.ReceiptId, amount: amount.toFixed(2) })
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
