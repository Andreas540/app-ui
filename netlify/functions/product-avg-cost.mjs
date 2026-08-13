// netlify/functions/product-avg-cost.mjs
// POST /api/product-avg-cost
// Updates a product's cost_method and/or writes a new avg cost history entry.
//
// Body:
//   { product_id, cost_method, timing, from_date? }
//
// timing:
//   'next'      — effective_from = today (future orders only)
//   'beginning' — effective_from = 1970-01-01 (retroactive to all orders)
//   'date'      — effective_from = from_date (from specified date)
//
// The existing DB trigger propagates the written history entry to order_items.product_cost.

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'
import { calcSupplierAvgCost, writeAvgCostHistory } from './utils/calc-supplier-avg-cost.mjs'

const VALID_METHODS = ['manual', 'avg_3m', 'avg_6m', 'avg_12m', 'last_purchase']

export const handler = withErrorLogging('product_avg_cost', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)

  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const tenantId = authz.tenantId

  const { product_id, cost_method, timing, from_date } = JSON.parse(event.body || '{}')

  if (!product_id) return cors(400, { error: 'product_id required' })
  if (!VALID_METHODS.includes(cost_method)) return cors(400, { error: 'Invalid cost_method' })
  if (!['next', 'beginning', 'date'].includes(timing)) return cors(400, { error: 'Invalid timing' })
  if (timing === 'date' && !from_date) return cors(400, { error: 'from_date required for timing=date' })

  // Verify product belongs to tenant
  const productRows = await sql`
    SELECT id, cost_method AS current_method
    FROM products
    WHERE id = ${product_id}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `
  if (!productRows.length) return cors(404, { error: 'Product not found' })

  // Update the cost_method on the product
  await sql`
    UPDATE products SET cost_method = ${cost_method}
    WHERE id = ${product_id}::uuid AND tenant_id = ${tenantId}::uuid
  `

  // For manual: no avg history entry to write — the user will use the existing
  // EditProduct cost change flow to set a manual history entry.
  if (cost_method === 'manual') {
    return cors(200, { ok: true, cost: null, message: 'Switched to manual cost method' })
  }

  // Calculate the avg cost using current supplier order data
  const cost = await calcSupplierAvgCost(sql, tenantId, product_id, cost_method)

  if (cost === null) {
    return cors(200, {
      ok: true,
      cost: null,
      message: 'No supplier orders found in window — manual cost remains in effect until first supplier order',
    })
  }

  // Determine effective_from date based on timing
  let effectiveFrom
  if (timing === 'beginning') {
    effectiveFrom = '1970-01-01'
  } else if (timing === 'date') {
    effectiveFrom = from_date
  } else {
    effectiveFrom = new Date().toISOString().slice(0, 10)
  }

  await writeAvgCostHistory(sql, tenantId, product_id, cost, effectiveFrom)

  return cors(200, { ok: true, cost, effective_from: effectiveFrom })
})

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
