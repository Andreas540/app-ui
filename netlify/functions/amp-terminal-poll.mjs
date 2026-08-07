// netlify/functions/amp-terminal-poll.mjs
// POST /api/amp-terminal-poll
// { receipt_id, order_id }
//
// Checks terminal_callbacks (written by amp-terminal-callback when EPS posts the result).
// Returns:
//   { status: 'pending' }                            — EPS hasn't posted yet
//   { status: 'approved', transaction_id, auth_code, card_type, last_four, amount }
//   { status: 'declined', message }

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

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

  // Check if EPS has posted the result via callback
  const cbRows = await sql`
    SELECT approved, amount, transaction_id, auth_code, card_type, last_four, token, response_msg
    FROM terminal_callbacks
    WHERE receipt_id = ${receipt_id} AND tenant_id = ${TENANT_ID}::uuid
    LIMIT 1
  `.catch(() => [])

  if (!cbRows.length) return cors(200, { status: 'pending' })

  const cb = cbRows[0]

  if (!cb.approved) {
    return cors(200, { status: 'declined', message: cb.response_msg || 'Card declined' })
  }

  // ── Approved — record payment if not already recorded ────────────────────

  const existing = await sql`
    SELECT id FROM payments
    WHERE order_id = ${order_id}::uuid AND tenant_id = ${TENANT_ID}::uuid
      AND notes LIKE ${'%TxID:' + (cb.transaction_id || '')}
    LIMIT 1
  `.catch(() => [])

  if (!existing.length) {
    const orderRows = await sql`
      SELECT o.id, o.customer_id, o.order_no,
             COALESCE(t.default_timezone, 'UTC') AS tz
      FROM orders o
      JOIN tenants t ON t.id = o.tenant_id
      WHERE o.id = ${order_id}::uuid AND o.tenant_id = ${TENANT_ID}::uuid
      LIMIT 1
    `
    if (orderRows.length) {
      const { customer_id, order_no, tz } = orderRows[0]
      const txNotes = `AMP Terminal TxID:${cb.transaction_id}${cb.auth_code ? ' AuthCode:' + cb.auth_code : ''}`
      const payDate = new Date().toLocaleString('en-CA', { timeZone: tz }).slice(0, 10)

      await sql`
        INSERT INTO payments (tenant_id, customer_id, order_id, amount, payment_type, payment_date, notes)
        VALUES (
          ${TENANT_ID}::uuid,
          ${customer_id},
          ${order_id}::uuid,
          ${cb.amount},
          'amp_terminal',
          ${payDate},
          ${txNotes}
        )
      `

      if (cb.token) {
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
          VALUES (${TENANT_ID}::uuid, ${customer_id}, ${cb.token}, ${cb.card_type}, ${cb.last_four})
          ON CONFLICT (tenant_id, token) DO NOTHING
        `
      }

      console.log(`AMP terminal payment recorded: order ${order_no}, TxID ${cb.transaction_id}, amount ${cb.amount}`)
    }
  }

  return cors(200, {
    status:         'approved',
    transaction_id: cb.transaction_id,
    auth_code:      cb.auth_code,
    card_type:      cb.card_type,
    last_four:      cb.last_four,
    amount:         Number(cb.amount),
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
