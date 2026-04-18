// netlify/functions/supply-chain-analyze.mjs
// POST /api/supply-chain-analyze
// Queries supply-chain data and returns an AI demand analysis.

import { neon }                    from '@neondatabase/serverless'
import { resolveAuthz }            from './utils/auth.mjs'
import { callClaude, logAiUsage }  from './utils/ai.mjs'
import { GENERAL_TONE, TOPICS }    from './utils/ai-prompts.mjs'

const TOPIC   = TOPICS.supply_chain_demand
const FEATURE = 'supply_chain_demand'
const MODEL   = 'claude-haiku-4-5-20251001'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'POST')    return resp(405, { error: 'Method not allowed' })

  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

  const sql   = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return resp(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  try {
    const [
      demandMonthly,
      warehouseStock,
      supplierOrders,
      undeliveredOrders,
      deliveryLeadTimes,
    ] = await Promise.all([

      // Monthly demand per product (last 6 months)
      sql`
        SELECT
          product_name,
          TO_CHAR(month, 'YYYY-MM') AS month,
          SUM(qty)::int             AS qty
        FROM public.v_customer_product_monthly
        WHERE tenant_id = ${TENANT_ID}
          AND month >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
        GROUP BY product_name, month
        ORDER BY product_name, month
      `,

      // Current warehouse inventory
      sql`
        SELECT
          product,
          SUM(CASE WHEN status = 'pre_production' THEN qty ELSE 0 END)::int AS pre_prod,
          SUM(CASE WHEN status = 'finished'        THEN qty ELSE 0 END)::int AS finished,
          SUM(qty)::int AS total
        FROM public.warehouse_deliveries
        WHERE tenant_id = ${TENANT_ID}
          AND delivered = false
        GROUP BY product
        ORDER BY product
      `,

      // Open supplier orders (not yet delivered)
      sql`
        SELECT
          p.name                                        AS product,
          s.name                                        AS supplier,
          os.qty::int                                   AS qty,
          TO_CHAR(os.order_date,    'YYYY-MM-DD')       AS order_date,
          TO_CHAR(os.est_delivery_date, 'YYYY-MM-DD')   AS est_delivery_date
        FROM public.orders_suppliers os
        JOIN public.suppliers s ON s.id = os.supplier_id
        JOIN public.products  p ON p.id = os.product_id
        WHERE os.tenant_id = ${TENANT_ID}
          AND os.delivered  = false
        ORDER BY os.est_delivery_date NULLS LAST
      `,

      // Undelivered customer orders
      sql`
        SELECT
          pr.name   AS product,
          SUM(oi.qty)::int AS qty_pending
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        JOIN public.products   pr  ON pr.id = oi.product_id
        WHERE o.tenant_id   = ${TENANT_ID}
          AND o.delivered   = false
          AND o.invoiced    = false
        GROUP BY pr.name
        ORDER BY pr.name
      `,

      // Avg lead time: supplier order → customer delivery (last 12 months, delivered only)
      sql`
        SELECT
          p.name                                          AS product,
          AVG(
            os.delivery_date::date - os.order_date::date
          )::numeric(6,1)                                 AS avg_days_supplier_to_wh,
          COUNT(*)::int                                   AS deliveries
        FROM public.orders_suppliers os
        JOIN public.products p ON p.id = os.product_id
        WHERE os.tenant_id    = ${TENANT_ID}
          AND os.delivered    = true
          AND os.delivery_date IS NOT NULL
          AND os.order_date   >= NOW() - INTERVAL '12 months'
        GROUP BY p.name
        ORDER BY p.name
      `,
    ])

    const userPrompt = buildPrompt({
      demandMonthly,
      warehouseStock,
      supplierOrders,
      undeliveredOrders,
      deliveryLeadTimes,
    })

    const systemPrompt = `${GENERAL_TONE}\n\n${TOPIC.systemPrompt}`

    const result = await callClaude({ systemPrompt, userPrompt, model: MODEL, maxTokens: 300 })

    logAiUsage({
      sql, tenantId: TENANT_ID, feature: FEATURE,
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    }).catch(e => console.error('ai_usage_log failed:', e))

    return resp(200, { analysis: result.text })

  } catch (e) {
    console.error('supply-chain-analyze error:', e)
    return resp(500, { error: 'Analysis failed', detail: e?.message })
  }
}

function buildPrompt({ demandMonthly, warehouseStock, supplierOrders, undeliveredOrders, deliveryLeadTimes }) {
  const lines = []

  if (demandMonthly.length) {
    lines.push('MONTHLY DEMAND (last 6 months, units sold):')
    const byProduct = {}
    for (const r of demandMonthly) {
      if (!byProduct[r.product_name]) byProduct[r.product_name] = []
      byProduct[r.product_name].push(`${r.month}: ${r.qty}`)
    }
    for (const [p, months] of Object.entries(byProduct)) {
      lines.push(`  ${p}: ${months.join(', ')}`)
    }
  }

  if (warehouseStock.length) {
    lines.push('\nWAREHOUSE INVENTORY (undelivered stock):')
    for (const r of warehouseStock) {
      lines.push(`  ${r.product}: ${r.total} total (${r.pre_prod} pre-prod, ${r.finished} finished)`)
    }
  }

  if (supplierOrders.length) {
    lines.push('\nOPEN SUPPLIER ORDERS (not yet delivered):')
    for (const r of supplierOrders) {
      lines.push(`  ${r.product} from ${r.supplier}: ${r.qty} units, ordered ${r.order_date}, est. delivery ${r.est_delivery_date ?? 'unknown'}`)
    }
  }

  if (undeliveredOrders.length) {
    lines.push('\nPENDING CUSTOMER ORDERS (not yet delivered):')
    for (const r of undeliveredOrders) {
      lines.push(`  ${r.product}: ${r.qty_pending} units pending`)
    }
  }

  if (deliveryLeadTimes.length) {
    lines.push('\nAVERAGE SUPPLIER LEAD TIMES (order → warehouse, last 12 months):')
    for (const r of deliveryLeadTimes) {
      lines.push(`  ${r.product}: ${r.avg_days_supplier_to_wh} days avg (${r.deliveries} deliveries)`)
    }
  }

  return lines.join('\n')
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
