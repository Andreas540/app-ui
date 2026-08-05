// netlify/functions/amp-terminal-poll.mjs
// POST /api/amp-terminal-poll
// { receipt_id, order_id }
//
// Polls EPS cloud for the terminal transaction result.
// Returns one of:
//   { status: 'pending' }                            — terminal hasn't responded yet
//   { status: 'approved', transaction_id, auth_code, card_type, last_four }
//   { status: 'declined', message }
//
// On approval: records the payment and upserts the card token against the customer.

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

const EPS_PULL_URL = 'https://postransactions.com/connect/pushresponse.php'

export const handler = withErrorLogging('amp-terminal-poll', async (event) => {
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
  const { receipt_id, order_id } = JSON.parse(rawBody)
  if (!receipt_id || !order_id) return cors(400, { error: 'receipt_id and order_id required' })

  // Load AMP credentials + device serial
  const ampRows = await sql`
    SELECT publishable_key AS account, secret_key AS apikey, device_serial
    FROM tenant_payment_providers
    WHERE tenant_id = ${TENANT_ID}::uuid AND provider = 'amp' AND enabled = true
      AND publishable_key IS NOT NULL AND secret_key IS NOT NULL AND device_serial IS NOT NULL
    LIMIT 1
  `
  if (!ampRows.length) return cors(400, { error: 'AMP not configured' })
  const { account, apikey, device_serial } = ampRows[0]

  // Pull result from EPS cloud
  const pullRes = await fetch(EPS_PULL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ account, device: device_serial, receiptId: receipt_id }),
  })
  const result = await pullRes.json()

  // No result yet — terminal still processing
  if (!result || result.TransactionResult === undefined || result.ResponseMsg === 'No record was found') {
    return cors(200, { status: 'pending' })
  }

  // Terminal responded but transaction was not approved
  if (!result.TransactionResult || result.TransactionResult === 'false') {
    return cors(200, { status: 'declined', message: result.ResponseMsg || 'Card declined' })
  }

  // ── Approved — record payment ─────────────────────────────────────────────

  // Verify order belongs to tenant + get customer_id
  const orderRows = await sql`
    SELECT o.id, o.customer_id, o.order_no,
           COALESCE(t.default_timezone, 'UTC') AS tz
    FROM orders o
    JOIN tenants t ON t.id = o.tenant_id
    WHERE o.id = ${order_id}::uuid AND o.tenant_id = ${TENANT_ID}::uuid
    LIMIT 1
  `
  if (!orderRows.length) return cors(404, { error: 'Order not found' })
  const { customer_id, order_no, tz } = orderRows[0]

  const amountPaid = Number(result.ApprovedAmount) || 0
  const transactionId = result.TransactionID || ''
  const authCode = result.AuthCode || ''
  const token = result.Token || null
  const cardType = result.CardType || null
  const lastFour = result.AccountNum ? String(result.AccountNum).slice(-4) : null

  const txNotes = `AMP Terminal TxID:${transactionId}${authCode ? ' AuthCode:' + authCode : ''}`
  const payDate = new Date().toLocaleString('en-CA', { timeZone: tz }).slice(0, 10)

  await sql`
    INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
    VALUES (
      ${TENANT_ID}::uuid,
      ${customer_id},
      ${order_id}::uuid,
      ${amountPaid},
      'amp_terminal',
      ${payDate},
      ${txNotes}
    )
  `

  // Upsert card token — foundation for card-on-file
  if (token) {
    await sql`
      CREATE TABLE IF NOT EXISTS customer_payment_tokens (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID        NOT NULL,
        customer_id UUID        NOT NULL,
        token       TEXT        NOT NULL,
        card_type   TEXT,
        last_four   TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, token)
      )
    `
    await sql`
      INSERT INTO customer_payment_tokens (tenant_id, customer_id, token, card_type, last_four)
      VALUES (${TENANT_ID}::uuid, ${customer_id}, ${token}, ${cardType}, ${lastFour})
      ON CONFLICT (tenant_id, token) DO NOTHING
    `
  }

  console.log(`AMP terminal payment recorded: order ${order_no}, TxID ${transactionId}, amount ${amountPaid}`)

  return cors(200, {
    status: 'approved',
    transaction_id: transactionId,
    auth_code: authCode,
    card_type: cardType,
    last_four: lastFour,
    amount: amountPaid,
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
