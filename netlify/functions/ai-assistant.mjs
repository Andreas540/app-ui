// netlify/functions/ai-assistant.mjs
// Powers the BizWiz AI assistant page.
//
// GET  /api/ai-assistant?action=snapshot            → { snapshot }
// POST /api/ai-assistant?action=suggest  + { snapshot }   → { suggestions: string[] }
// POST /api/ai-assistant?action=ask      + { snapshot, question } → { answer: string }

import { neon }                    from '@neondatabase/serverless'
import { resolveAuthz }            from './utils/auth.mjs'
import { callClaude, logAiUsage }  from './utils/ai.mjs'

const MODEL = 'claude-haiku-4-5-20251001'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})

  try {
    const url    = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const action = url.searchParams.get('action') || 'snapshot'
    const lang   = url.searchParams.get('lang') || 'en'

    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql   = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return resp(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // ── action=snapshot ────────────────────────────────────────────────────────
    if (action === 'snapshot') {
      const [
        tenantRows,
        monthlyRevenue,
        topCustomers,
        topProducts,
        costsByCategory,
        recurringCosts,
        recentOrders,
      ] = await Promise.all([

        // Tenant name
        sql`SELECT name FROM public.tenants WHERE id = ${TENANT_ID}::uuid`,

        // Revenue & profit last 13 months
        sql`
          SELECT
            TO_CHAR(month, 'YYYY-MM')      AS month,
            SUM(revenue)::float8            AS revenue,
            SUM(gross_profit)::float8       AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
            AND month >= (DATE_TRUNC('month', NOW()) - INTERVAL '12 months')::date
          GROUP BY month
          ORDER BY month ASC
        `,

        // Top 10 customers by revenue
        sql`
          SELECT
            customer_name,
            customer_type,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY customer_id, customer_name, customer_type
          ORDER BY SUM(revenue) DESC
          LIMIT 10
        `,

        // Top 10 products by revenue
        sql`
          SELECT
            product_name,
            SUM(qty)::int             AS qty,
            SUM(revenue)::float8      AS revenue,
            SUM(gross_profit)::float8 AS gross_profit
          FROM public.v_customer_product_monthly
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY product_id, product_name
          ORDER BY SUM(revenue) DESC
          LIMIT 10
        `,

        // Costs by category last 12 months
        sql`
          SELECT
            cost_category,
            SUM(amount)::float8 AS amount
          FROM public.costs
          WHERE tenant_id = ${TENANT_ID}
            AND cost_date >= (DATE_TRUNC('month', NOW()) - INTERVAL '11 months')::date
          GROUP BY cost_category
          ORDER BY SUM(amount) DESC
        `,

        // Active recurring costs
        sql`
          SELECT cost_category, amount::float8, start_date, end_date, notes
          FROM public.costs_recurring
          WHERE tenant_id = ${TENANT_ID}
            AND (end_date IS NULL OR end_date >= NOW())
          ORDER BY amount DESC
        `,

        // Last 20 orders
        sql`
          SELECT
            o.order_no,
            TO_CHAR(o.order_date, 'YYYY-MM-DD') AS order_date,
            c.name                               AS customer_name,
            SUM(oi.qty::numeric * oi.unit_price)::float8 AS revenue
          FROM public.orders o
          JOIN public.customers   c  ON c.id  = o.customer_id
          JOIN public.order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID}
            AND o.notes IS DISTINCT FROM 'Old tab'
          GROUP BY o.id, o.order_no, o.order_date, c.name
          ORDER BY o.order_date DESC
          LIMIT 20
        `,
      ])

      const snapshot = {
        tenantName:      tenantRows[0]?.name ?? 'your company',
        monthlyRevenue,
        topCustomers,
        topProducts,
        costsByCategory,
        recurringCosts,
        recentOrders,
      }

      return resp(200, { snapshot })
    }

    // ── parse POST body ────────────────────────────────────────────────────────
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { /* ignore */ }

    // ── action=suggest ─────────────────────────────────────────────────────────
    if (action === 'suggest') {
      const snapshot = body.snapshot
      if (!snapshot) return resp(400, { error: 'snapshot required' })

      const langNames = { en: 'English', sv: 'Swedish', es: 'Spanish' }
      const langName  = langNames[lang] ?? 'English'

      const contextSummary = buildContextSummary(snapshot)

      const systemPrompt =
        `You are a business analyst. Based on the business data summary provided, ` +
        `generate exactly 5 short questions a small business owner might want to ask about their own data. ` +
        `Questions should be specific to the actual numbers — reference real patterns you notice. ` +
        `Return ONLY a valid JSON array of 5 strings, nothing else. No markdown, no explanation. ` +
        `Example: ["Why did revenue drop in March?", "Which product has the best margin?"] ` +
        `Questions must be in ${langName}.`

      const userPrompt = `BUSINESS DATA:\n${contextSummary}\n\nReturn 5 questions as a JSON array.`

      let suggestions: string[] = []
      try {
        const result = await callClaude({ systemPrompt, userPrompt, model: MODEL, maxTokens: 300 })
        logAiUsage({
          sql, tenantId: TENANT_ID, feature: 'bizwiz_suggest',
          model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        }).catch(err => console.error('ai_usage_log failed:', err))
        // Parse JSON array from response
        const match = result.text.match(/\[[\s\S]*\]/)
        if (match) suggestions = JSON.parse(match[0])
      } catch (err) {
        console.error('BizWiz suggest error:', err)
        // Return empty suggestions — non-fatal
      }

      return resp(200, { suggestions })
    }

    // ── action=ask ─────────────────────────────────────────────────────────────
    if (action === 'ask') {
      const { snapshot, question } = body
      if (!snapshot)  return resp(400, { error: 'snapshot required' })
      if (!question)  return resp(400, { error: 'question required' })

      const langNames = { en: 'English', sv: 'Swedish', es: 'Spanish' }
      const langName  = langNames[lang] ?? 'English'

      const contextSummary = buildContextSummary(snapshot)

      const systemPrompt =
        `You are a straight-talking business advisor for ${snapshot.tenantName ?? 'this business'}. ` +
        `Plain everyday language, short sentences, no jargon. ` +
        `Base everything strictly on the data provided. Do not guess at personal details or invent information. ` +
        `Never use the word "tenant". Refer to the business as "${snapshot.tenantName ?? 'your company'}" or "you". ` +
        `Under 150 words. Plain text only — no bullet points, no markdown. ` +
        `Respond in ${langName}.`

      const userPrompt = `BUSINESS DATA:\n${contextSummary}\n\nQUESTION: ${question}`

      let answer = ''
      try {
        const result = await callClaude({ systemPrompt, userPrompt, model: MODEL, maxTokens: 400 })
        answer = result.text
        logAiUsage({
          sql, tenantId: TENANT_ID, feature: 'bizwiz_ask',
          model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        }).catch(err => console.error('ai_usage_log failed:', err))
      } catch (err) {
        console.error('BizWiz ask error:', err)
        return resp(502, { error: 'AI unavailable: ' + err.message })
      }

      return resp(200, { answer })
    }

    return resp(400, { error: `Unknown action: ${action}` })

  } catch (err) {
    console.error('ai-assistant error:', err)
    return resp(500, { error: String(err) })
  }
}

// ── Build a concise text summary of the snapshot for the prompt ───────────────

function buildContextSummary(snapshot) {
  const lines = []
  const { tenantName, monthlyRevenue, topCustomers, topProducts, costsByCategory, recurringCosts, recentOrders } = snapshot

  lines.push(`COMPANY: ${tenantName ?? 'unknown'}`)

  if (monthlyRevenue?.length) {
    lines.push(`\nMONTHLY REVENUE & PROFIT (last ${monthlyRevenue.length} months):`)
    for (const r of monthlyRevenue) {
      const rev = Number(r.revenue)
      const gp  = Number(r.gross_profit)
      const mgn = rev > 0 ? (gp / rev * 100).toFixed(1) : '0.0'
      lines.push(`  ${r.month}: $${rev.toFixed(0)} revenue, $${gp.toFixed(0)} profit (${mgn}% margin)`)
    }
  }

  if (topCustomers?.length) {
    lines.push(`\nTOP CUSTOMERS (by revenue, all time):`)
    for (const c of topCustomers) {
      const rev = Number(c.revenue)
      const gp  = Number(c.gross_profit)
      const mgn = rev > 0 ? (gp / rev * 100).toFixed(1) : '0.0'
      lines.push(`  ${c.customer_name}${c.customer_type ? ` (${c.customer_type})` : ''}: $${rev.toFixed(0)} | ${mgn}% margin`)
    }
  }

  if (topProducts?.length) {
    lines.push(`\nTOP PRODUCTS (by revenue, all time):`)
    for (const p of topProducts) {
      const rev = Number(p.revenue)
      const gp  = Number(p.gross_profit)
      const mgn = rev > 0 ? (gp / rev * 100).toFixed(1) : '0.0'
      lines.push(`  ${p.product_name}: ${p.qty} units | $${rev.toFixed(0)} | ${mgn}% margin`)
    }
  }

  if (costsByCategory?.length) {
    lines.push(`\nCOSTS BY CATEGORY (last 12 months):`)
    for (const c of costsByCategory) {
      lines.push(`  ${c.cost_category}: $${Number(c.amount).toFixed(0)}`)
    }
  }

  if (recurringCosts?.length) {
    lines.push(`\nACTIVE RECURRING COSTS:`)
    for (const c of recurringCosts) {
      lines.push(`  ${c.cost_category}: $${Number(c.amount).toFixed(0)}/month${c.notes ? ` (${c.notes})` : ''}`)
    }
  }

  if (recentOrders?.length) {
    lines.push(`\nRECENT ORDERS (most recent first):`)
    for (const o of recentOrders) {
      lines.push(`  ${o.order_date}: ${o.customer_name} | $${Number(o.revenue).toFixed(0)}`)
    }
  }

  return lines.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
