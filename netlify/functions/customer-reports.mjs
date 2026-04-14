// netlify/functions/customer-reports.mjs
// Serves customer ranking and customer detail data from v_customer_product_monthly.
//
// GET /api/customer-reports?action=ranking[&from=YYYY-MM&to=YYYY-MM]
//   → { customers: [...], totals: { revenue, gross_profit } }
//
// GET /api/customer-reports?action=detail&customer_id=UUID[&from=YYYY-MM&to=YYYY-MM]
//   → { products: [...] }

import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})

  try {
    const url = new URL(
      event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`
    )
    const action     = url.searchParams.get('action') || 'ranking'
    const from       = url.searchParams.get('from')          // YYYY-MM
    const to         = url.searchParams.get('to')            // YYYY-MM
    const customerId = url.searchParams.get('customer_id')

    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // ✅ Multi-tenant auth (DB lookup via JWT → user → tenant)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return resp(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const fromDate = from ? `${from}-01` : null
    const toDate   = to   ? `${to}-01`   : null
    const hasRange = !!(fromDate && toDate)

    // ── action=ranking ──────────────────────────────────────────────────────
    if (action === 'ranking') {
      let customers, totals

      if (hasRange) {
        customers = await sql`
          SELECT
            customer_id,
            customer_name,
            customer_type,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
            AND month >= ${fromDate}::date
            AND month <= ${toDate}::date
          GROUP BY customer_id, customer_name, customer_type
          ORDER BY SUM(revenue) DESC
        `
        totals = await sql`
          SELECT
            COALESCE(SUM(revenue), 0)::float8      AS revenue,
            COALESCE(SUM(gross_profit), 0)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
            AND month >= ${fromDate}::date
            AND month <= ${toDate}::date
        `
      } else {
        customers = await sql`
          SELECT
            customer_id,
            customer_name,
            customer_type,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY customer_id, customer_name, customer_type
          ORDER BY SUM(revenue) DESC
        `
        totals = await sql`
          SELECT
            COALESCE(SUM(revenue), 0)::float8      AS revenue,
            COALESCE(SUM(gross_profit), 0)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
        `
      }

      return resp(200, {
        customers,
        totals: totals[0] ?? { revenue: 0, gross_profit: 0 },
      })
    }

    // ── action=detail ───────────────────────────────────────────────────────
    if (action === 'detail') {
      if (!customerId) return resp(400, { error: 'customer_id required' })

      let products

      if (hasRange) {
        products = await sql`
          SELECT
            product_id,
            product_name,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id   = ${TENANT_ID}
            AND customer_id = ${customerId}::uuid
            AND month >= ${fromDate}::date
            AND month <= ${toDate}::date
          GROUP BY product_id, product_name
          ORDER BY SUM(revenue) DESC
        `
      } else {
        products = await sql`
          SELECT
            product_id,
            product_name,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id   = ${TENANT_ID}
            AND customer_id = ${customerId}::uuid
          GROUP BY product_id, product_name
          ORDER BY SUM(revenue) DESC
        `
      }

      return resp(200, { products })
    }

    return resp(400, { error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('customer-reports error:', err)
    return resp(500, { error: String(err) })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
