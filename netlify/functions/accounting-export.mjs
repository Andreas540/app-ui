// netlify/functions/accounting-export.mjs
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' })

  try {
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return resp(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const url = new URL(event.rawUrl || `http://x${event.path}`)
    const month = url.searchParams.get('month') // YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return resp(400, { error: 'month parameter required (YYYY-MM)' })
    }

    const fromDate = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const toDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    const rows = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        c.name                                                          AS customer_name,
        COALESCE((
          SELECT SUM(oi.qty * oi.unit_price)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ), 0)::numeric(12,2)                                            AS order_amount,
        p.name                                                          AS partner_name,
        COALESCE((
          SELECT SUM(op.amount + COALESCE(op.from_customer_amount, 0))
          FROM order_partners op
          WHERE op.order_id = o.id
        ), 0)::numeric(12,2)                                            AS partner_amount
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN partners p ON p.id = c.partner_id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.order_date >= ${fromDate}::date
        AND o.order_date <  ${toDate}::date
      ORDER BY o.order_date ASC, c.name ASC
    `

    return resp(200, { rows })
  } catch (err) {
    return resp(500, { error: String(err?.message || err) })
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
