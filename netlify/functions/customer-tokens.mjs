// netlify/functions/customer-tokens.mjs
// GET /api/customer-tokens?customer_id=...
// Returns stored card tokens for a customer (for card-on-file charging).

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('customer-tokens', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)

  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const customer_id = event.queryStringParameters?.customer_id
  if (!customer_id) return cors(400, { error: 'customer_id required' })

  const tokens = await sql`
    SELECT id, card_type, last_four, exp_date, created_at
    FROM customer_payment_tokens
    WHERE tenant_id = ${TENANT_ID}::uuid AND customer_id = ${customer_id}::uuid
    ORDER BY created_at DESC
  `.catch(() => [])

  return cors(200, { tokens })
})

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
