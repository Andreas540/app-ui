// netlify/functions/amp-terminal-callback.mjs
// POST /api/amp-terminal-callback?tenant_id=...&receipt_id=...
//
// EPS posts the terminal transaction result here when the card is processed.
// We store it in terminal_callbacks so amp-terminal-poll can pick it up.

import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('amp-terminal-callback', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})

  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)

  const tenant_id  = event.queryStringParameters?.tenant_id
  const receipt_id = event.queryStringParameters?.receipt_id
  if (!tenant_id || !receipt_id) return cors(400, { error: 'tenant_id and receipt_id required' })

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf-8')
    : (event.body || '{}')

  let result
  try { result = JSON.parse(rawBody) } catch { result = {} }

  console.log(`AMP terminal callback receipt=${receipt_id} tenant=${tenant_id}:`, JSON.stringify(result))

  await sql`
    CREATE TABLE IF NOT EXISTS terminal_callbacks (
      receipt_id     TEXT        NOT NULL,
      tenant_id      UUID        NOT NULL,
      approved       BOOLEAN     NOT NULL,
      amount         NUMERIC,
      transaction_id TEXT,
      auth_code      TEXT,
      card_type      TEXT,
      last_four      TEXT,
      token          TEXT,
      response_msg   TEXT,
      raw_response   JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (receipt_id, tenant_id)
    )
  `

  const approved      = result.TransactionResult === 'true' || result.TransactionResult === true
  const amount        = Number(result.ApprovedAmount) || 0
  const transaction_id = result.TransactionID || ''
  const auth_code     = result.AuthCode || ''
  const card_type     = result.CardType || null
  const last_four     = result.AccountNum ? String(result.AccountNum).slice(-4) : null
  const token         = result.Token || null
  const response_msg  = result.ResponseMsg || null

  await sql`
    INSERT INTO terminal_callbacks
      (receipt_id, tenant_id, approved, amount, transaction_id, auth_code, card_type, last_four, token, response_msg, raw_response)
    VALUES
      (${receipt_id}, ${tenant_id}::uuid, ${approved}, ${amount}, ${transaction_id}, ${auth_code}, ${card_type}, ${last_four}, ${token}, ${response_msg}, ${JSON.stringify(result)})
    ON CONFLICT (receipt_id, tenant_id) DO UPDATE SET
      approved       = EXCLUDED.approved,
      amount         = EXCLUDED.amount,
      transaction_id = EXCLUDED.transaction_id,
      auth_code      = EXCLUDED.auth_code,
      card_type      = EXCLUDED.card_type,
      last_four      = EXCLUDED.last_four,
      token          = EXCLUDED.token,
      response_msg   = EXCLUDED.response_msg,
      raw_response   = EXCLUDED.raw_response
  `

  return cors(200, { success: true })
})

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
