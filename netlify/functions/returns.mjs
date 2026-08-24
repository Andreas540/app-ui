// netlify/functions/returns.mjs
// GET  /api/returns          — list returns for tenant (filterable by customer_id, order_id)
// POST /api/returns          — create a new return with items + optional partner adjustment
// GET  /api/returns?id=X     — single return detail with items

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('returns', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return get(event)
  if (event.httpMethod === 'POST')   return create(event)
  if (event.httpMethod === 'DELETE') return remove(event)
  return cors(405, { error: 'Method not allowed' })
})

// ─── GET ─────────────────────────────────────────────────────────────────────

async function get(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const params = event.queryStringParameters || {}
  const { id, customer_id, order_id } = params

  // Single return detail
  if (id) {
    const rows = await sql`
      SELECT r.*, c.name AS customer_name, o.order_no
      FROM returns r
      JOIN customers c ON c.id = r.customer_id
      JOIN orders    o ON o.id = r.order_id
      WHERE r.tenant_id = ${TENANT_ID} AND r.id = ${id}
      LIMIT 1
    `
    if (rows.length === 0) return cors(404, { error: 'Not found' })
    const ret = rows[0]

    const items = await sql`
      SELECT ri.*, p.name AS product_name
      FROM return_items ri
      LEFT JOIN products p ON p.id = ri.product_id
      WHERE ri.return_id = ${id}
      ORDER BY ri.id
    `
    const partnerAdjs = await sql`
      SELECT rpa.*, p.name AS partner_name
      FROM return_partner_adjustments rpa
      JOIN partners p ON p.id = rpa.partner_id
      WHERE rpa.return_id = ${id}
    `
    return cors(200, { return: { ...ret, items, partner_adjustments: partnerAdjs } })
  }

  // List — optional filters
  const returns = await sql`
    SELECT r.id, r.return_date, r.reason, r.condition, r.settlement_type,
           r.settlement_amount, r.supplier_fault, r.restock_requested, r.created_at,
           c.name AS customer_name, c.id AS customer_id,
           o.order_no, o.id AS order_id,
           COALESCE(
             json_agg(json_build_object(
               'product_name', p.name,
               'qty_returned', ri.qty_returned,
               'unit_price',   ri.unit_price
             ) ORDER BY ri.id) FILTER (WHERE ri.id IS NOT NULL),
             '[]'::json
           ) AS items
    FROM returns r
    JOIN customers c ON c.id = r.customer_id
    JOIN orders    o ON o.id = r.order_id
    LEFT JOIN return_items ri ON ri.return_id = r.id
    LEFT JOIN products p ON p.id = ri.product_id
    WHERE r.tenant_id = ${TENANT_ID}
      ${customer_id ? sql`AND r.customer_id = ${customer_id}` : sql``}
      ${order_id    ? sql`AND r.order_id    = ${order_id}`    : sql``}
    GROUP BY r.id, c.name, c.id, o.order_no, o.id
    ORDER BY r.return_date DESC, r.created_at DESC
  `
  return cors(200, { returns })
}

// ─── POST ────────────────────────────────────────────────────────────────────

async function create(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  let body
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '')
    body = JSON.parse(raw)
  } catch { return cors(400, { error: 'Invalid JSON body' }) }

  const {
    customer_id,
    order_id,
    return_date,
    reason,
    reason_notes      = null,
    condition,
    restock_requested = false,
    supplier_fault    = false,
    settlement_type,
    settlement_amount = 0,
    settlement_date   = null,
    notes             = null,
    items             = [],          // [{ order_item_id, product_id, qty_returned, unit_price }]
    partner_adjustments = [],        // [{ partner_id, amount_reversed }]
  } = body || {}

  // Required field validation
  const missing = []
  if (!customer_id)      missing.push('customer_id')
  if (!order_id)         missing.push('order_id')
  if (!return_date)      missing.push('return_date')
  if (!reason)           missing.push('reason')
  if (!condition)        missing.push('condition')
  if (!settlement_type)  missing.push('settlement_type')
  if (missing.length > 0) return cors(400, { error: `Missing required fields: ${missing.join(', ')}` })

  if (!items.length) return cors(400, { error: 'At least one return item is required' })

  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  // Verify customer + order belong to this tenant
  const ownership = await sql`
    SELECT o.id FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.tenant_id = ${TENANT_ID}
      AND o.id = ${order_id}
      AND c.id = ${customer_id}
    LIMIT 1
  `
  if (ownership.length === 0) return cors(404, { error: 'Order not found for this customer' })

  // Insert return header
  const [ret] = await sql`
    INSERT INTO returns (
      tenant_id, customer_id, order_id, return_date,
      reason, reason_notes, condition,
      restock_requested, supplier_fault,
      settlement_type, settlement_amount, settlement_date,
      notes
    ) VALUES (
      ${TENANT_ID}, ${customer_id}, ${order_id}, ${return_date},
      ${reason}, ${reason_notes}, ${condition},
      ${restock_requested}, ${supplier_fault},
      ${settlement_type}, ${Number(settlement_amount)}, ${settlement_date},
      ${notes}
    )
    RETURNING id
  `

  // Insert line items
  for (const item of items) {
    await sql`
      INSERT INTO return_items (return_id, order_item_id, product_id, qty_returned, unit_price)
      VALUES (
        ${ret.id},
        ${item.order_item_id},
        ${item.product_id || null},
        ${Number(item.qty_returned)},
        ${Number(item.unit_price)}
      )
    `
  }

  // Insert partner adjustments if any
  for (const adj of partner_adjustments) {
    await sql`
      INSERT INTO return_partner_adjustments (return_id, partner_id, amount_reversed)
      VALUES (${ret.id}, ${adj.partner_id}, ${Number(adj.amount_reversed)})
    `
  }

  return cors(201, { id: ret.id })
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

async function remove(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const id = event.queryStringParameters?.id
  if (!id) return cors(400, { error: 'id required' })

  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const res = await sql`
    DELETE FROM returns
    WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    RETURNING id
  `
  if (res.length === 0) return cors(404, { error: 'Not found' })
  return cors(200, { ok: true })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
