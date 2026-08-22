// netlify/functions/sim-factors.mjs
// Returns per-period totals for simulation factors (repayments, partner shares).
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})

  try {
    const url = new URL(
      event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`
    )
    const factor = url.searchParams.get('factor') ?? 'repayment'  // 'repayment' | 'partner_share'
    const period = url.searchParams.get('period') ?? 'month'       // 'month' | 'year'
    const from   = url.searchParams.get('from')                    // YYYY-MM or YYYY (optional)
    const to     = url.searchParams.get('to')                      // YYYY-MM or YYYY (optional)

    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return resp(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const trunc = period === 'year' ? 'year' : 'month'

    // Convert from/to params to date boundaries for filtering.
    // date_trunc on the column is then compared to these boundaries so we
    // include all days within the from-month and to-month (or year).
    const fromDate = from
      ? (period === 'year' ? `${from}-01-01` : `${from}-01`)
      : null
    const toDate = to
      ? (period === 'year' ? `${to}-01-01` : `${to}-01`)
      : null

    let rows

    if (factor === 'repayment') {
      if (fromDate && toDate) {
        rows = await sql`
          SELECT
            date_trunc(${trunc}, payment_date)::date::text AS period_start,
            SUM(amount)::float8                            AS amount
          FROM payments
          WHERE tenant_id  = ${TENANT_ID}
            AND payment_type = 'Repayment'
            AND date_trunc(${trunc}, payment_date)::date >= ${fromDate}::date
            AND date_trunc(${trunc}, payment_date)::date <= ${toDate}::date
          GROUP BY 1
          ORDER BY 1 ASC
        `
      } else {
        rows = await sql`
          SELECT
            date_trunc(${trunc}, payment_date)::date::text AS period_start,
            SUM(amount)::float8                            AS amount
          FROM payments
          WHERE tenant_id  = ${TENANT_ID}
            AND payment_type = 'Repayment'
          GROUP BY 1
          ORDER BY 1 ASC
        `
      }
    } else {
      // partner_share — sum of order_partners.amount grouped by order_date
      if (fromDate && toDate) {
        rows = await sql`
          SELECT
            date_trunc(${trunc}, o.order_date)::date::text AS period_start,
            SUM(op.amount)::float8                         AS amount
          FROM order_partners op
          JOIN orders o ON o.id = op.order_id
          WHERE o.tenant_id = ${TENANT_ID}
            AND date_trunc(${trunc}, o.order_date)::date >= ${fromDate}::date
            AND date_trunc(${trunc}, o.order_date)::date <= ${toDate}::date
          GROUP BY 1
          ORDER BY 1 ASC
        `
      } else {
        rows = await sql`
          SELECT
            date_trunc(${trunc}, o.order_date)::date::text AS period_start,
            SUM(op.amount)::float8                         AS amount
          FROM order_partners op
          JOIN orders o ON o.id = op.order_id
          WHERE o.tenant_id = ${TENANT_ID}
          GROUP BY 1
          ORDER BY 1 ASC
        `
      }
    }

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
