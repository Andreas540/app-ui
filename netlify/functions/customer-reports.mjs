// netlify/functions/customer-reports.mjs
// Serves customer ranking, detail, and AI analysis from v_customer_product_monthly.
//
// GET /api/customer-reports?action=ranking[&from=YYYY-MM&to=YYYY-MM]
//   → { customers: [...], totals: { revenue, gross_profit } }
//
// GET /api/customer-reports?action=detail&customer_id=UUID[&from=YYYY-MM&to=YYYY-MM]
//   → { products: [...] }
//
// GET /api/customer-reports?action=analyze&customer_id=UUID[&from=YYYY-MM&to=YYYY-MM&lang=en]
//   → { analysis: "..." }

import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'
import { callClaude, logAiUsage } from './utils/ai.mjs'

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
            SUM(qty)::int             AS qty,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id   = ${TENANT_ID}
            AND customer_id = ${customerId}::uuid
            AND month >= ${fromDate}::date
            AND month <= ${toDate}::date
          GROUP BY product_id, product_name
          ORDER BY SUM(qty) DESC
        `
      } else {
        products = await sql`
          SELECT
            product_id,
            product_name,
            SUM(qty)::int             AS qty,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id   = ${TENANT_ID}
            AND customer_id = ${customerId}::uuid
          GROUP BY product_id, product_name
          ORDER BY SUM(qty) DESC
        `
      }

      return resp(200, { products })
    }

    // ── action=analyze ──────────────────────────────────────────────────────
    if (action === 'analyze') {
      if (!customerId) return resp(400, { error: 'customer_id required' })

      const lang      = url.searchParams.get('lang') || 'en'
      const langNames = { en: 'English', sv: 'Swedish', es: 'Spanish' }
      const langName  = langNames[lang] ?? 'English'

      // Run all context queries in parallel
      const [tenantRows, summary, allCustomers, trend, products, recentOrders] = await Promise.all([

        // 0. Tenant name
        sql`SELECT name FROM public.tenants WHERE id = ${TENANT_ID}::uuid`,

        // 1. This customer's totals in the selected period
        hasRange ? sql`
          SELECT customer_name, customer_type,
            SUM(qty)::int AS qty,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customerId}::uuid
            AND month >= ${fromDate}::date AND month <= ${toDate}::date
          GROUP BY customer_name, customer_type
        ` : sql`
          SELECT customer_name, customer_type,
            SUM(qty)::int AS qty,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customerId}::uuid
          GROUP BY customer_name, customer_type
        `,

        // 2. All customers in period — for rank + averages
        hasRange ? sql`
          SELECT customer_id,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
            AND month >= ${fromDate}::date AND month <= ${toDate}::date
          GROUP BY customer_id ORDER BY SUM(revenue) DESC
        ` : sql`
          SELECT customer_id,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY customer_id ORDER BY SUM(revenue) DESC
        `,

        // 3. Monthly trend — always last 12 months for trend context
        sql`
          SELECT TO_CHAR(month, 'YYYY-MM') AS month,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customerId}::uuid
            AND month >= (DATE_TRUNC('month', NOW()) - INTERVAL '11 months')::date
          GROUP BY month ORDER BY month ASC
        `,

        // 4. Product mix
        hasRange ? sql`
          SELECT product_name,
            SUM(qty)::int AS qty,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customerId}::uuid
            AND month >= ${fromDate}::date AND month <= ${toDate}::date
          GROUP BY product_name ORDER BY SUM(qty) DESC LIMIT 8
        ` : sql`
          SELECT product_name,
            SUM(qty)::int AS qty,
            SUM(revenue)::float8 AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID} AND customer_id = ${customerId}::uuid
          GROUP BY product_name ORDER BY SUM(qty) DESC LIMIT 8
        `,

        // 5. Recent individual orders — granular, from orders table
        hasRange ? sql`
          SELECT o.order_no,
            TO_CHAR(o.order_date, 'YYYY-MM-DD') AS order_date,
            SUM(oi.qty::numeric * oi.unit_price)::float8 AS revenue,
            SUM(oi.qty)::int AS qty,
            COUNT(DISTINCT oi.product_id)::int AS product_count
          FROM public.orders o
          JOIN public.order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = ${customerId}::uuid
            AND o.notes IS DISTINCT FROM 'Old tab'
            AND o.order_date >= ${fromDate}::date AND o.order_date <= ${toDate}::date
          GROUP BY o.id, o.order_no, o.order_date
          ORDER BY o.order_date DESC LIMIT 10
        ` : sql`
          SELECT o.order_no,
            TO_CHAR(o.order_date, 'YYYY-MM-DD') AS order_date,
            SUM(oi.qty::numeric * oi.unit_price)::float8 AS revenue,
            SUM(oi.qty)::int AS qty,
            COUNT(DISTINCT oi.product_id)::int AS product_count
          FROM public.orders o
          JOIN public.order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = ${customerId}::uuid
            AND o.notes IS DISTINCT FROM 'Old tab'
          GROUP BY o.id, o.order_no, o.order_date
          ORDER BY o.order_date DESC LIMIT 10
        `,
      ])

      if (!summary[0]) return resp(404, { error: 'Customer not found' })

      const tenantName = tenantRows[0]?.name ?? 'your company'
      const cust       = summary[0]
      const custRev    = Number(cust.revenue)
      const custPro    = Number(cust.gross_profit)
      const custMargin = custRev > 0 ? (custPro / custRev * 100) : 0

      // Compute ranks
      const byRev = [...allCustomers].sort((a, b) => Number(b.revenue)      - Number(a.revenue))
      const byPro = [...allCustomers].sort((a, b) => Number(b.gross_profit) - Number(a.gross_profit))
      const byMgn = [...allCustomers].sort((a, b) => {
        const mb = Number(b.revenue) > 0 ? Number(b.gross_profit) / Number(b.revenue) : 0
        const ma = Number(a.revenue) > 0 ? Number(a.gross_profit) / Number(a.revenue) : 0
        return mb - ma
      })
      const revRank = byRev.findIndex(c => c.customer_id === customerId) + 1
      const proRank = byPro.findIndex(c => c.customer_id === customerId) + 1
      const mgnRank = byMgn.findIndex(c => c.customer_id === customerId) + 1

      const totalCustomers  = allCustomers.length
      const totalRev        = allCustomers.reduce((s, c) => s + Number(c.revenue),      0)
      const totalPro        = allCustomers.reduce((s, c) => s + Number(c.gross_profit), 0)
      const avgRevPerCust   = totalCustomers > 0 ? totalRev / totalCustomers : 0
      const avgMargin       = totalRev > 0 ? (totalPro / totalRev * 100) : 0

      const period = hasRange ? `${fromDate} to ${toDate}` : 'All available data'

      const trendLines = trend.map(r => {
        const rev = Number(r.revenue)
        const mgn = rev > 0 ? (Number(r.gross_profit) / rev * 100).toFixed(1) : '0.0'
        return `  ${r.month}: $${rev.toFixed(0)} revenue, ${mgn}% margin`
      }).join('\n')

      const productLines = products.map(r => {
        const rev = Number(r.revenue)
        const mgn = rev > 0 ? (Number(r.gross_profit) / rev * 100).toFixed(1) : '0.0'
        return `  ${r.product_name}: ${r.qty} units | $${rev.toFixed(0)} | ${mgn}% margin`
      }).join('\n')

      const orderLines = recentOrders.map(r =>
        `  ${r.order_date}: ${r.qty} units, ${r.product_count} product(s) | $${Number(r.revenue).toFixed(0)}`
      ).join('\n')

      const systemPrompt =
        `You are a business advisor for ${tenantName}, a small business. ` +
        `Write in plain, clear language — friendly but professional. Short sentences. No corporate jargon. ` +
        `Base everything strictly on the data. Do not guess at personal reasons, do not suggest contacting or calling the customer. ` +
        `Only say what the data actually supports. If there is nothing meaningful to recommend, keep it short. ` +
        `Never use the word "tenant". Refer to the business as "${tenantName}" or "you". ` +
        `Structure your response in exactly two parts separated by a blank line: ` +
        `First part — label it "Analysis:" on its own line, then 2-3 sentences describing what the numbers show. Reference actual figures. ` +
        `Second part — label it "Recommendations:" on its own line, then 1-2 sentences suggesting concrete things ${tenantName} can do differently — based on patterns in the data, such as product mix, order frequency, margins, or timing. ` +
        `Be as brief as the insight requires. Plain text only — no bullet points, no markdown. ` +
        `Respond in ${langName}.`

      const userPrompt = [
        `CUSTOMER: ${cust.customer_name}${cust.customer_type ? ` (${cust.customer_type})` : ''}`,
        `PERIOD: ${period}`,
        ``,
        `PERFORMANCE (${totalCustomers} customers total):`,
        `  Revenue: $${custRev.toFixed(0)} | Rank #${revRank} | Avg per customer: $${avgRevPerCust.toFixed(0)}`,
        `  Gross Profit: $${custPro.toFixed(0)} | Rank #${proRank}`,
        `  Profit Margin: ${custMargin.toFixed(1)}% | Rank #${mgnRank} | Tenant avg margin: ${avgMargin.toFixed(1)}%`,
        ``,
        `MONTHLY REVENUE TREND (last 12 months):`,
        trendLines || `  No data`,
        ``,
        `PRODUCT MIX (by quantity):`,
        productLines || `  No data`,
        ``,
        `RECENT ORDERS (most recent first):`,
        orderLines || `  No data`,
      ].join('\n')

      let analysisText
      let usedModel
      try {
        const result = await callClaude({ systemPrompt, userPrompt, maxTokens: 400 })
        analysisText = result.text
        usedModel    = result.model
        // Log usage — non-blocking, don't let logging failure break the response
        logAiUsage({
          sql, tenantId: TENANT_ID, feature: 'customer_analysis',
          model: usedModel, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        }).catch(err => console.error('ai_usage_log insert failed:', err))
      } catch (aiErr) {
        console.error('Claude API error:', aiErr)
        return resp(502, { error: 'AI analysis unavailable: ' + aiErr.message })
      }

      return resp(200, { analysis: analysisText })
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
