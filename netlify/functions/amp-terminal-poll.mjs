// netlify/functions/amp-terminal-poll.mjs
// POST /api/amp-terminal-poll
// { receipt_id, order_id }
//
// 1. Checks terminal_callbacks first (written by amp-terminal-callback if EPS posts to us)
// 2. Falls back to polling EPS pushresponse.php directly
// On approval: records payment in DB (idempotent).

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

  // ── 1. Check terminal_callbacks (populated if EPS posts to our callback URL) ─
  const cbRows = await sql`
    SELECT approved, amount, transaction_id, auth_code, card_type, last_four, token, response_msg
    FROM terminal_callbacks
    WHERE receipt_id = ${receipt_id} AND tenant_id = ${TENANT_ID}::uuid
    LIMIT 1
  `.catch(() => [])

  if (cbRows.length) {
    const cb = cbRows[0]
    if (!cb.approved) {
      const isCancelled = cb.response_msg === 'CANCELLED'
      return cors(200, { status: 'declined', message: isCancelled ? 'Payment cancelled on terminal' : (cb.response_msg || 'Card declined') })
    }
    // Callback says approved but may lack full financial data — only use it if amount is present
    if (Number(cb.amount) > 0 && cb.transaction_id) {
      await recordPayment(sql, TENANT_ID, order_id, cb)
      return cors(200, { status: 'approved', transaction_id: cb.transaction_id, auth_code: cb.auth_code, card_type: cb.card_type, last_four: cb.last_four, amount: Number(cb.amount) })
    }
    // Fall through to EPS direct poll for full transaction data
  }

  // ── 2. Poll EPS directly ──────────────────────────────────────────────────────
  const ampRows = await sql`
    SELECT publishable_key AS account, secret_key AS apikey, device_serial
    FROM tenant_payment_providers
    WHERE tenant_id = ${TENANT_ID}::uuid AND provider = 'amp' AND enabled = true
      AND publishable_key IS NOT NULL AND secret_key IS NOT NULL AND device_serial IS NOT NULL
    LIMIT 1
  `
  if (!ampRows.length) return cors(400, { error: 'AMP not configured' })
  const { account, apikey, device_serial } = ampRows[0]

  const pullRes = await fetch(EPS_PULL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ account, device: device_serial, receiptId: receipt_id }),
  })
  const result = await pullRes.json()

  console.log(`EPS pullResponse receipt=${receipt_id}:`, JSON.stringify(result))

  // No result yet — terminal still processing
  if (!result || result.ResponseMsg === 'No record was found' || result.TransactionResult === undefined) {
    return cors(200, { status: 'pending' })
  }

  const tr = result.TransactionResult
  const approved = tr === true || tr === 1 || (typeof tr === 'string' && tr.toLowerCase() === 'true') || tr === 'Approved'
  if (!approved) {
    return cors(200, { status: 'declined', message: result.ResponseMsg || 'Card declined' })
  }

  const cb = {
    approved:       true,
    amount:         Number(result.ApprovedAmount) || 0,
    transaction_id: result.TransactionID || '',
    auth_code:      result.AuthCode || '',
    card_type:      result.CardType || null,
    last_four:      result.AccountNum ? String(result.AccountNum).slice(-4) : null,
    token:          result.Token || null,
    exp_date:       result.ExpDate || null,
    response_msg:   result.ResponseMsg || null,
  }

  await recordPayment(sql, TENANT_ID, order_id, cb)

  return cors(200, { status: 'approved', transaction_id: cb.transaction_id, auth_code: cb.auth_code, card_type: cb.card_type, last_four: cb.last_four, amount: cb.amount })
})

async function recordPayment(sql, tenantId, orderId, cb) {
  const orderRows = await sql`
    SELECT o.customer_id, o.order_no, COALESCE(t.default_timezone, 'UTC') AS tz
    FROM orders o
    JOIN tenants t ON t.id = o.tenant_id
    WHERE o.id = ${orderId}::uuid AND o.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `
  if (!orderRows.length) return

  const { customer_id, order_no, tz } = orderRows[0]
  const txNotes = `AMP Terminal TxID:${cb.transaction_id}${cb.auth_code ? ' AuthCode:' + cb.auth_code : ''}`
  const payDate = new Date().toLocaleString('en-CA', { timeZone: tz }).slice(0, 10)

  const existing = await sql`
    SELECT id FROM payments
    WHERE order_id = ${orderId}::uuid AND tenant_id = ${tenantId}::uuid AND notes = ${txNotes}
    LIMIT 1
  `
  if (!existing.length) {
    await sql`
      INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
      VALUES (${tenantId}::uuid, ${customer_id}, ${orderId}::uuid, ${cb.amount}, 'amp_terminal', ${payDate}, ${txNotes})
    `
  }

  if (cb.token) {
    await sql`
      CREATE TABLE IF NOT EXISTS customer_payment_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL, customer_id UUID NOT NULL,
        token TEXT NOT NULL, card_type TEXT, last_four TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, token)
      )
    `.catch(() => {})
    await sql`
      INSERT INTO customer_payment_tokens (tenant_id, customer_id, token, card_type, last_four, exp_date)
      VALUES (${tenantId}::uuid, ${customer_id}, ${cb.token}, ${cb.card_type}, ${cb.last_four}, ${cb.exp_date})
      ON CONFLICT (tenant_id, token) DO UPDATE SET exp_date = COALESCE(EXCLUDED.exp_date, customer_payment_tokens.exp_date)
    `.catch(() => {})
  }

  console.log(`AMP terminal payment recorded: order ${order_no}, TxID ${cb.transaction_id}, amount ${cb.amount}`)
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
