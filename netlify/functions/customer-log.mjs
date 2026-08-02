// netlify/functions/customer-log.mjs
// GET    ?customer_id=<uuid>  → chronological timeline (orders, payments, notes interleaved)
// POST   { customer_id, note_text, after_item_id? }  → insert a note
// DELETE ?id=<note_id>         → delete a note
//
// Notes anchor to a specific order or payment by ID (after_item_id).
// NULL after_item_id = note belongs at the top of the list.
// Multiple notes after the same anchor are ordered by created_at ASC
// (oldest closest to the anchor record).

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('customer-log', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getLog(event)
  if (event.httpMethod === 'POST')   return addNote(event)
  if (event.httpMethod === 'DELETE') return deleteNote(event)
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
             NULLIF(STRING_AGG(COALESCE(p.name, s.name), ', ' ORDER BY oi.created_at ASC NULLS LAST), '') AS product_name,
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
             created_at AS date,
             after_item_id,
             'note' AS kind
      FROM customer_notes
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customer_id}
      ORDER BY created_at ASC
    `,
  ])

  // Merge orders + payments by date DESC (stable: order_no / created_at as tiebreaker)
  const base = [...orders, ...payments].sort((a, b) => {
    const diff = new Date(b.date).getTime() - new Date(a.date).getTime()
    if (diff !== 0) return diff
    // payments have no secondary key here; orders use order_no already sorted
    return 0
  })

  // Index anchored notes by after_item_id
  const anchored = {}
  for (const n of notes) {
    if (n.after_item_id) {
      if (!anchored[n.after_item_id]) anchored[n.after_item_id] = []
      anchored[n.after_item_id].push(n) // already sorted created_at ASC from query
    }
  }

  // Top notes (no anchor) — newest first
  const topNotes = notes
    .filter(n => !n.after_item_id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Build final list: top notes → then each base item followed by its anchored notes
  const items = [...topNotes]
  for (const item of base) {
    items.push(item)
    if (anchored[item.id]) items.push(...anchored[item.id])
  }

  return cors(200, { items })
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

  const customer_id   = body.customer_id
  const note_text     = (body.note_text || '').trim()
  const after_item_id = body.after_item_id ?? null
  if (!customer_id) return cors(400, { error: 'customer_id required' })
  if (!note_text)   return cors(400, { error: 'note_text required' })
  const created_by = authz.email || null

  const [row] = await sql`
    INSERT INTO customer_notes (tenant_id, customer_id, note_text, created_by, after_item_id)
    VALUES (${TENANT_ID}, ${customer_id}, ${note_text}, ${created_by}, ${after_item_id})
    RETURNING id, note_text, created_by,
              created_at AS date,
              after_item_id,
              'note' AS kind
  `
  return cors(201, { item: row })
}

async function deleteNote(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const id = event.queryStringParameters?.id
  if (!id) return cors(400, { error: 'id required' })

  const result = await sql`
    DELETE FROM customer_notes
    WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    RETURNING id
  `
  if (result.length === 0) return cors(404, { error: 'Note not found' })
  return cors(200, { ok: true })
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
