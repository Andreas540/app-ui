// netlify/functions/coverage-products.mjs
// CRUD for coverage products (product_kind = 'coverage').
// Distinct from product.mjs so coverage doesn't appear in the standard product list.

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('coverage-products', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return list(event)
  if (event.httpMethod === 'POST')   return create(event)
  if (event.httpMethod === 'PUT')    return update(event)
  return cors(405, { error: 'Method not allowed' })
})

async function list(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const rows = await sql`
    SELECT id, name, cost::float8 AS cost, price_amount::float8 AS price_amount,
           coverage_duration_days, coverage_ref, coverage_issuer_type, coverage_issuer_name,
           coverage_doc_data
    FROM products
    WHERE tenant_id = ${TENANT_ID}
      AND product_kind = 'coverage'
    ORDER BY name
  `
  return cors(200, { coverage_products: rows })
}

async function create(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const body = JSON.parse(event.body || '{}')
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const name = (body.name || '').trim()
  if (!name) return cors(400, { error: 'name is required' })
  const costNum = Number(body.cost)
  if (!Number.isFinite(costNum) || costNum < 0) return cors(400, { error: 'cost must be a number ≥ 0' })
  const priceAmount    = body.price_amount != null ? Number(body.price_amount) : null
  const durationDays   = body.coverage_duration_days ? Math.max(1, parseInt(body.coverage_duration_days, 10) || 1) : null
  const coverageRef    = body.coverage_ref ? String(body.coverage_ref).trim() : null
  const validIssuers   = ['manufacturer', 'shop', 'third_party']
  const issuerType     = validIssuers.includes(body.coverage_issuer_type) ? body.coverage_issuer_type : 'shop'
  const issuerName     = body.coverage_issuer_name ? String(body.coverage_issuer_name).trim() : null
  const docData        = body.coverage_doc_data ? String(body.coverage_doc_data) : null

  const [row] = await sql`
    INSERT INTO products (
      tenant_id, name, cost, category, product_kind, price_amount,
      coverage_duration_days, coverage_ref, coverage_issuer_type, coverage_issuer_name, coverage_doc_data
    ) VALUES (
      ${TENANT_ID}, ${name}, ${costNum}, 'product', 'coverage', ${priceAmount},
      ${durationDays}, ${coverageRef}, ${issuerType}, ${issuerName}, ${docData}
    )
    RETURNING id, name, cost::float8 AS cost, price_amount::float8 AS price_amount,
              coverage_duration_days, coverage_ref, coverage_issuer_type, coverage_issuer_name,
              coverage_doc_data
  `

  await sql`
    INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from)
    VALUES (${TENANT_ID}, ${row.id}, ${costNum}, now())
  `

  return cors(201, { coverage_product: row })
}

async function update(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const body = JSON.parse(event.body || '{}')
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const { id } = body
  if (!id) return cors(400, { error: 'id is required' })

  const hasName     = typeof body.name === 'string'
  const hasCost     = body.cost !== undefined
  const hasPrice    = 'price_amount'           in body
  const hasDuration = 'coverage_duration_days' in body
  const hasRef      = 'coverage_ref'           in body
  const hasIssType  = 'coverage_issuer_type'   in body
  const hasIssName  = 'coverage_issuer_name'   in body
  const hasDoc      = 'coverage_doc_data'      in body

  const validIssuers = ['manufacturer', 'shop', 'third_party']
  const newName      = hasName     ? body.name.trim()                                                          : null
  const newCost      = hasCost     ? Number(body.cost)                                                         : null
  const newPrice     = hasPrice    ? (body.price_amount != null ? Number(body.price_amount) : null)            : null
  const newDuration  = hasDuration ? (body.coverage_duration_days ? Math.max(1, parseInt(body.coverage_duration_days, 10) || 1) : null) : null
  const newRef       = hasRef      ? (body.coverage_ref ? String(body.coverage_ref).trim() : null)             : null
  const newIssType   = hasIssType  ? (validIssuers.includes(body.coverage_issuer_type) ? body.coverage_issuer_type : null) : null
  const newIssName   = hasIssName  ? (body.coverage_issuer_name ? String(body.coverage_issuer_name).trim() : null) : null
  const newDoc       = hasDoc      ? (body.coverage_doc_data ? String(body.coverage_doc_data) : null)          : null

  const [updated] = await sql`
    UPDATE products
    SET name                   = CASE WHEN ${hasName}     THEN ${newName}     ELSE name                   END,
        cost                   = CASE WHEN ${hasCost}     THEN ${newCost}     ELSE cost                   END,
        price_amount           = CASE WHEN ${hasPrice}    THEN ${newPrice}    ELSE price_amount           END,
        coverage_duration_days = CASE WHEN ${hasDuration} THEN ${newDuration} ELSE coverage_duration_days END,
        coverage_ref           = CASE WHEN ${hasRef}      THEN ${newRef}      ELSE coverage_ref           END,
        coverage_issuer_type   = CASE WHEN ${hasIssType}  THEN ${newIssType}  ELSE coverage_issuer_type   END,
        coverage_issuer_name   = CASE WHEN ${hasIssName}  THEN ${newIssName}  ELSE coverage_issuer_name   END,
        coverage_doc_data      = CASE WHEN ${hasDoc}      THEN ${newDoc}      ELSE coverage_doc_data      END
    WHERE id = ${id} AND tenant_id = ${TENANT_ID} AND product_kind = 'coverage'
    RETURNING id, name, cost::float8 AS cost, price_amount::float8 AS price_amount,
              coverage_duration_days, coverage_ref, coverage_issuer_type, coverage_issuer_name,
              coverage_doc_data
  `
  if (!updated) return cors(404, { error: 'Coverage product not found' })
  return cors(200, { ok: true, coverage_product: updated })
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
