// netlify/functions/customer-billing-options.mjs
// GET /api/customer-billing-options?customer_id=X
// Returns open orders and advance payments for a customer, used when creating a manual booking.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getOptions(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getOptions(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const customer_id = event.queryStringParameters?.customer_id
    if (!customer_id) return cors(400, { error: 'customer_id is required' })

    // Open orders: orders with a positive remaining balance
    const orders = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        COALESCE(o.amount, 0)::numeric(12,2) AS amount,
        COALESCE((
          SELECT SUM(py.amount) FROM payments py
          WHERE py.order_id = o.id
        ), 0)::numeric(12,2) AS paid_amount,
        GREATEST(COALESCE(o.amount, 0) - COALESCE((
          SELECT SUM(py.amount) FROM payments py
          WHERE py.order_id = o.id
        ), 0), 0)::numeric(12,2) AS balance,
        COALESCE(MAX(p.name), MAX(s.name)) AS product_name
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id
      LEFT JOIN services s ON s.id = oi.service_id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.customer_id = ${customer_id}
      GROUP BY o.id, o.order_no, o.order_date, o.amount
      HAVING GREATEST(COALESCE(o.amount, 0) - COALESCE((
        SELECT SUM(py.amount) FROM payments py
        WHERE py.order_id = o.id
      ), 0), 0) > 0
      ORDER BY o.order_date DESC, o.order_no DESC
      LIMIT 20
    `

    // Advance payments: payments with no order linked
    const payments = await sql`
      SELECT
        py.id,
        py.amount,
        py.payment_date,
        py.notes,
        py.payment_type
      FROM payments py
      WHERE py.tenant_id = ${TENANT_ID}
        AND py.customer_id = ${customer_id}
        AND py.order_id IS NULL
      ORDER BY py.payment_date DESC
      LIMIT 20
    `

    return cors(200, { orders, payments })
  } catch (e) {
    console.error('customer-billing-options error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

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
