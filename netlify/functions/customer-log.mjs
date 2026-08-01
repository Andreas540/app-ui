// netlify/functions/customer-log.mjs
// GET  ?customer_id=<uuid>  → merged chronological timeline (orders, payments, notes)
// POST { customer_id, note_text }  → insert a note

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('customer-log', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getLog(event)
  if (event.httpMethod === 'POST')   return addNote(event)
  return cors(405, { error: 'Method not allowed' })
})

async function getLog(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const customer_id = event.queryStringParameters?.customer_id
  if (!customer_id) return cors(400, { error: 'customer_id required' })

  const [orders, payments, notes] = await Promise.all([
    sql`
      SELECT id, order_no, order_date AS date, status,
             total_amount::float8 AS total_amount,
             'order' AS kind
      FROM orders
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customer_id}
      ORDER BY order_date DESC, order_no DESC
    `,
    sql`
      SELECT id, payment_date AS date, amount::float8 AS amount,
             payment_type, notes AS payment_notes,
             'payment' AS kind
      FROM payments
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customer_id}
      ORDER BY payment_date DESC, created_at DESC
    `,
    sql`
      SELECT id, note_text, created_by, created_at AS date,
             'note' AS kind
      FROM customer_notes
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customer_id}
      ORDER BY created_at DESC
    `,
  ])

  // Merge and sort by date descending
  const all = [...orders, ...payments, ...notes].sort((a, b) => {
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    return db - da
  })

  return cors(200, { items: all })
}

async function addNote(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const body = JSON.parse(event.body || '{}')
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const customer_id = body.customer_id
  const note_text   = (body.note_text || '').trim()
  if (!customer_id) return cors(400, { error: 'customer_id required' })
  if (!note_text)   return cors(400, { error: 'note_text required' })
  const created_by  = authz.email || null

  const [row] = await sql`
    INSERT INTO customer_notes (tenant_id, customer_id, note_text, created_by)
    VALUES (${TENANT_ID}, ${customer_id}, ${note_text}, ${created_by})
    RETURNING id, note_text, created_by, created_at AS date, 'note' AS kind
  `
  return cors(201, { item: row })
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  }
}
