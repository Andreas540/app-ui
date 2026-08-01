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
      SELECT o.id, o.order_no, o.order_date AS date,
             o.delivered_at,
             MAX(o.notes) AS notes,
             COALESCE(SUM(oi.qty * oi.unit_price), 0)::float8 AS total_amount,
             COALESCE(MAX(p.name), MAX(s.name)) AS product_name,
             'order' AS kind
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id
      LEFT JOIN services s ON s.id = oi.service_id
      WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = ${customer_id}
      GROUP BY o.id, o.order_no, o.order_date, o.delivered_at
      ORDER BY o.order_date DESC, o.order_no DESC
    `,
    sql`
      SELECT p.id, p.payment_date AS date, p.amount::float8 AS amount,
             p.payment_type, p.notes AS payment_notes,
             'payment' AS kind
      FROM payments p
      WHERE p.tenant_id = ${TENANT_ID} AND p.customer_id = ${customer_id}
      ORDER BY p.payment_date DESC, p.created_at DESC
    `,
    sql`
      SELECT id, note_text, created_by,
             sort_date AS date,
             created_at AS note_created_at,
             'note' AS kind
      FROM customer_notes
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customer_id}
      ORDER BY sort_date DESC
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
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf-8')
    : (event.body || '{}')
  const body = JSON.parse(rawBody)
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const customer_id = body.customer_id
  const note_text   = (body.note_text || '').trim()
  if (!customer_id) return cors(400, { error: 'customer_id required' })
  if (!note_text)   return cors(400, { error: 'note_text required' })
  const created_by  = authz.email || null
  const sort_date   = body.sort_date ? new Date(body.sort_date) : new Date()

  const [row] = await sql`
    INSERT INTO customer_notes (tenant_id, customer_id, note_text, created_by, sort_date)
    VALUES (${TENANT_ID}, ${customer_id}, ${note_text}, ${created_by}, ${sort_date})
    RETURNING id, note_text, created_by,
              sort_date AS date,
              created_at AS note_created_at,
              'note' AS kind
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
