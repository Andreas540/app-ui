// netlify/functions/rps.mjs
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return resp(204, {})

  try {
    const url = new URL(
      event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`
    )
    const from = url.searchParams.get('from') // YYYY-MM, optional
    const to   = url.searchParams.get('to')   // YYYY-MM, optional
    const monthsParam = parseInt(url.searchParams.get('months') || '3', 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(60, monthsParam)) : 3

    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // ✅ Multi-tenant source of truth (DB lookup via JWT -> user -> tenant)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return resp(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    let rows

    if (from && to) {
      // Date-range mode: return all months in [from, to] regardless of zero revenue
      const fromDate = `${from}-01`
      const toDate   = `${to}-01`
      rows = await sql`
        SELECT
          TO_CHAR(v.month_start, 'YYYY-MM')         AS month,
          v.month_start,
          COALESCE(v.revenue_amount, 0)::float8      AS revenue,
          COALESCE(v.gross_profit, 0)::float8        AS gross_profit,
          COALESCE(v.operating_profit, 0)::float8    AS operating_profit,
          COALESCE(v.surplus, 0)::float8             AS surplus
        FROM public.revenue_profit_surplus_by_month v
        WHERE v.tenant_id = ${TENANT_ID}
          AND v.month_start >= ${fromDate}::date
          AND v.month_start <= ${toDate}::date
        ORDER BY v.month_start ASC
      `
    } else {
      // Default mode: last N months that actually contain data
      rows = await sql`
        WITH mset AS (
          SELECT month_start
          FROM public.revenue_profit_surplus_by_month
          WHERE tenant_id = ${TENANT_ID}
            AND revenue_amount IS NOT NULL
            AND revenue_amount != 0
          ORDER BY month_start DESC
          LIMIT ${months}
        )
        SELECT
          TO_CHAR(v.month_start, 'YYYY-MM')         AS month,
          v.month_start,
          COALESCE(v.revenue_amount, 0)::float8      AS revenue,
          COALESCE(v.gross_profit, 0)::float8        AS gross_profit,
          COALESCE(v.operating_profit, 0)::float8    AS operating_profit,
          COALESCE(v.surplus, 0)::float8             AS surplus
        FROM public.revenue_profit_surplus_by_month v
        JOIN mset ON mset.month_start = v.month_start
        WHERE v.tenant_id = ${TENANT_ID}
        ORDER BY v.month_start ASC
      `
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


