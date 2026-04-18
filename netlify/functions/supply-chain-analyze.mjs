// netlify/functions/supply-chain-analyze.mjs
// POST /api/supply-chain-analyze
// Queries supply-chain data and returns an AI demand analysis.

import { neon }                    from '@neondatabase/serverless'
import { resolveAuthz }            from './utils/auth.mjs'
import { callClaude, logAiUsage }  from './utils/ai.mjs'
import { GENERAL_TONE, TOPICS }    from './utils/ai-prompts.mjs'
import { logActivity }             from './utils/activity-logger.mjs'
import { withErrorLogging }        from './utils/with-error-logging.mjs'

const TOPIC   = TOPICS.supply_chain_demand
const FEATURE = 'supply_chain_demand'
const MODEL   = 'claude-haiku-4-5-20251001'

export const handler = withErrorLogging('supply_chain_analyze', async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(204, {})
  if (event.httpMethod !== 'POST')    return resp(405, { error: 'Method not allowed' })

  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

  const sql   = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return resp(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const [
      demandMonthly,
      warehouseStock,
      supplierOrders,
      undeliveredOrders,
      deliveryLeadTimes,
    ] = await Promise.all([

      // Monthly demand per product (last 6 months) via the reporting view
      sql`
        SELECT
          product_name,
          TO_CHAR(month, 'YYYY-MM') AS month,
          SUM(qty)::int             AS qty
        FROM v_customer_product_monthly
        WHERE tenant_id = ${TENANT_ID}
          AND month >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
        GROUP BY product_name, month
        ORDER BY product_name, month
      `,

      // Current warehouse inventory using the same CTE logic as supply-chain-overview
      sql`
        WITH wd AS (
          SELECT
            product_id,
            SUM(CASE WHEN supplier_manual_delivered IN ('M','S') THEN qty ELSE 0 END) AS pre_from_m,
            SUM(CASE WHEN supplier_manual_delivered = 'P'        THEN qty ELSE 0 END) AS finished_from_p,
            SUM(CASE WHEN supplier_manual_delivered = 'D'        THEN qty ELSE 0 END) AS outbound_qty
          FROM warehouse_deliveries
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY product_id
        ),
        lp AS (
          SELECT product_id, SUM(qty_produced) AS produced_qty
          FROM labor_production
          WHERE tenant_id = ${TENANT_ID}
          GROUP BY product_id
        ),
        base AS (
          SELECT
            COALESCE(wd.product_id, lp.product_id) AS product_id,
            COALESCE(wd.pre_from_m,       0) AS pre_from_m,
            COALESCE(wd.finished_from_p,  0) AS finished_from_p,
            COALESCE(wd.outbound_qty,     0) AS outbound_qty,
            COALESCE(lp.produced_qty,     0) AS produced_qty
          FROM wd
          FULL OUTER JOIN lp ON lp.product_id = wd.product_id
        )
        SELECT
          p.name                                                            AS product,
          (base.pre_from_m - base.produced_qty)::int                       AS pre_prod,
          (base.finished_from_p + base.produced_qty - base.outbound_qty)::int AS finished,
          (base.pre_from_m + base.finished_from_p - base.outbound_qty)::int   AS total
        FROM base
        JOIN products p ON p.id = base.product_id
        WHERE p.tenant_id = ${TENANT_ID}
          AND (p.category IS NULL OR p.category != 'service')
        ORDER BY p.name
      `,

      // Open supplier orders (not in customs, not yet delivered)
      sql`
        SELECT
          p.name                                      AS product,
          s.name                                      AS supplier,
          SUM(ois.qty)::int                           AS qty,
          TO_CHAR(os.est_delivery_date, 'YYYY-MM-DD') AS est_delivery_date
        FROM orders_suppliers os
        JOIN order_items_suppliers ois ON ois.order_id = os.id
        JOIN products  p ON p.id = ois.product_id
        JOIN suppliers s ON s.id = os.supplier_id
        WHERE os.tenant_id  = ${TENANT_ID}
          AND os.delivered  = FALSE
          AND os.in_customs = FALSE
        GROUP BY p.name, s.name, os.est_delivery_date
        ORDER BY os.est_delivery_date NULLS LAST
      `,

      // Undelivered customer orders (remaining qty after partial deliveries)
      sql`
        WITH order_remaining AS (
          SELECT
            oi.product_id,
            GREATEST(oi.qty - COALESCE(o.delivered_quantity, 0), 0) AS remaining_qty
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID}
            AND oi.qty > COALESCE(o.delivered_quantity, 0)
        )
        SELECT
          p.name           AS product,
          SUM(remaining_qty)::int AS qty_pending
        FROM order_remaining
        JOIN products p ON p.id = order_remaining.product_id
        GROUP BY p.name
        HAVING SUM(remaining_qty) > 0
        ORDER BY p.name
      `,

      // Avg lead time: supplier order date → warehouse delivery (last 12 months)
      sql`
        SELECT
          p.name                                                      AS product,
          AVG(os.delivery_date::date - os.est_delivery_date::date)::numeric(6,1) AS avg_days_vs_estimate,
          COUNT(*)::int                                               AS deliveries
        FROM orders_suppliers os
        JOIN order_items_suppliers ois ON ois.order_id = os.id
        JOIN products p ON p.id = ois.product_id
        WHERE os.tenant_id      = ${TENANT_ID}
          AND os.delivered      = TRUE
          AND os.delivery_date  IS NOT NULL
          AND os.est_delivery_date IS NOT NULL
          AND os.delivery_date >= NOW() - INTERVAL '12 months'
        GROUP BY p.name
        ORDER BY p.name
      `,
    ])

    const userPrompt = buildPrompt({ demandMonthly, warehouseStock, supplierOrders, undeliveredOrders, deliveryLeadTimes })
    const systemPrompt = `${GENERAL_TONE}\n\n${TOPIC.systemPrompt}`

    const result = await callClaude({ systemPrompt, userPrompt, model: MODEL, maxTokens: 300 })

    logAiUsage({
      sql, tenantId: TENANT_ID, feature: FEATURE,
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    }).catch(e => console.error('ai_usage_log failed:', e))

    logActivity({ sql, event, action: 'supply_chain_analyze', success: true, tenantId: TENANT_ID })
      .catch(e => console.error('logActivity failed:', e))

    return resp(200, { analysis: result.text })
})

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
    lines.push('\nWAREHOUSE INVENTORY:')
    for (const r of warehouseStock) {
      lines.push(`  ${r.product}: ${r.total} total (${r.pre_prod} pre-prod, ${r.finished} finished)`)
    }
  }

  if (supplierOrders.length) {
    lines.push('\nOPEN SUPPLIER ORDERS (not yet delivered):')
    for (const r of supplierOrders) {
      lines.push(`  ${r.product} from ${r.supplier}: ${r.qty} units, est. delivery ${r.est_delivery_date ?? 'unknown'}`)
    }
  }

  if (undeliveredOrders.length) {
    lines.push('\nPENDING CUSTOMER ORDERS:')
    for (const r of undeliveredOrders) {
      lines.push(`  ${r.product}: ${r.qty_pending} units pending`)
    }
  }

  if (deliveryLeadTimes.length) {
    lines.push('\nSUPPLIER DELIVERY VS ESTIMATE (last 12 months):')
    for (const r of deliveryLeadTimes) {
      const sign = r.avg_days_vs_estimate > 0 ? '+' : ''
      lines.push(`  ${r.product}: ${sign}${r.avg_days_vs_estimate} days vs estimate (${r.deliveries} orders)`)
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
