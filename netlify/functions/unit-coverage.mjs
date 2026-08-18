// netlify/functions/unit-coverage.mjs
// CRUD for unit_coverage rows (unit-attachment pattern, L2).
//
// GET ?unit_id=X                     → list coverage rows attached to unit X
// GET ?available_for_unit=X          → coverage order lines for binding (customer-scoped)
// GET ?available_for_unit=X&tenant_wide=1 → same, all lines for tenant
// POST                               → create (bind or ad-hoc)
// PUT                                → edit name/dates
// DELETE ?id=X                       → remove

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('unit-coverage', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return get(event)
  if (event.httpMethod === 'POST')   return create(event)
  if (event.httpMethod === 'PUT')    return update(event)
  if (event.httpMethod === 'DELETE') return remove(event)
  return cors(405, { error: 'Method not allowed' })
})

async function get(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const params = event.queryStringParameters ?? {}

  // ── Coverage order lines available for binding ─────────────────────────────
  if (params.available_for_unit) {
    const unitId = parseInt(params.available_for_unit, 10)
    const tenantWide = params.tenant_wide === '1'

    // Resolve unit's customer + delivered_at for date defaulting
    const [unitInfo] = await sql`
      SELECT
        iu.id,
        iu.order_item_id,
        o.customer_id,
        COALESCE(o.delivered_at, o.order_date) AS delivered_at
      FROM inventory_units iu
      LEFT JOIN order_items oi ON oi.id = iu.order_item_id
      LEFT JOIN orders o ON o.id = oi.order_id
      WHERE iu.id = ${unitId} AND iu.tenant_id = ${TENANT_ID}
      LIMIT 1
    `
    if (!unitInfo) return cors(404, { error: 'Unit not found' })

    const customerId    = unitInfo.customer_id ?? null
    const deliveredAt   = unitInfo.delivered_at ?? null

    // Return lines for this customer (or all if tenantWide)
    const lines = await sql`
      SELECT
        oi.id           AS order_item_id,
        o.id            AS order_id,
        o.order_no,
        o.order_date,
        o.customer_id,
        c.name          AS customer_name,
        p.id            AS coverage_product_id,
        p.name,
        p.coverage_duration_days,
        p.coverage_ref,
        p.coverage_issuer_type,
        p.coverage_issuer_name,
        oi.qty,
        COUNT(uc.id)::int AS bound_count,
        (o.customer_id = ${customerId}) AS is_customer_match
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN unit_coverage uc ON uc.order_item_id = oi.id
      WHERE o.tenant_id = ${TENANT_ID}
        AND p.product_kind = 'addon'
        AND (${tenantWide} OR o.customer_id = ${customerId})
      GROUP BY oi.id, o.id, o.order_no, o.order_date, o.customer_id, c.name,
               p.id, p.name, p.coverage_duration_days, p.coverage_ref,
               p.coverage_issuer_type, p.coverage_issuer_name, oi.qty
      ORDER BY is_customer_match DESC, o.order_date DESC
    `
    return cors(200, { unit_delivered_at: deliveredAt, customer_id: customerId, lines })
  }

  // ── Coverage rows attached to a unit ──────────────────────────────────────
  if (params.unit_id) {
    const unitId = parseInt(params.unit_id, 10)
    const today  = new Date().toISOString().slice(0, 10)

    const rows = await sql`
      SELECT
        uc.id,
        uc.order_item_id,
        uc.coverage_product_id,
        uc.name,
        uc.issuer_type,
        uc.issuer_name,
        uc.coverage_ref,
        uc.start_date,
        uc.end_date,
        uc.created_at,
        o.order_no,
        c.name AS customer_name
      FROM unit_coverage uc
      LEFT JOIN order_items oi ON oi.id = uc.order_item_id
      LEFT JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE uc.unit_id = ${unitId} AND uc.tenant_id = ${TENANT_ID}
      ORDER BY uc.start_date DESC, uc.created_at DESC
    `
    const coverages = rows.map(r => ({ ...r, is_active: r.end_date >= today }))
    return cors(200, { coverages })
  }

  return cors(400, { error: 'unit_id or available_for_unit param required' })
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

  const { unit_id, order_item_id, coverage_product_id, name, issuer_type, issuer_name, coverage_ref, start_date, end_date } = body
  if (!unit_id || !name || !start_date || !end_date) {
    return cors(400, { error: 'unit_id, name, start_date, end_date are required' })
  }

  const validIssuers  = ['manufacturer', 'shop', 'third_party']
  const safeIssuer    = validIssuers.includes(issuer_type) ? issuer_type : 'shop'

  const [unit] = await sql`
    SELECT id FROM inventory_units WHERE id = ${unit_id} AND tenant_id = ${TENANT_ID} LIMIT 1
  `
  if (!unit) return cors(404, { error: 'Unit not found' })

  const [row] = await sql`
    INSERT INTO unit_coverage (
      tenant_id, unit_id, order_item_id, coverage_product_id,
      name, issuer_type, issuer_name, coverage_ref, start_date, end_date
    ) VALUES (
      ${TENANT_ID}, ${unit_id}, ${order_item_id ?? null}, ${coverage_product_id ?? null},
      ${name}, ${safeIssuer}, ${issuer_name ?? null}, ${coverage_ref ?? null},
      ${start_date}, ${end_date}
    )
    RETURNING id, unit_id, order_item_id, coverage_product_id,
              name, issuer_type, issuer_name, coverage_ref, start_date, end_date, created_at
  `
  const today = new Date().toISOString().slice(0, 10)
  return cors(201, { coverage: { ...row, is_active: row.end_date >= today } })
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

  const hasName  = 'name'       in body
  const hasStart = 'start_date' in body
  const hasEnd   = 'end_date'   in body

  const [updated] = await sql`
    UPDATE unit_coverage
    SET name       = CASE WHEN ${hasName}  THEN ${body.name ?? null}       ELSE name       END,
        start_date = CASE WHEN ${hasStart} THEN ${body.start_date ?? null}  ELSE start_date END,
        end_date   = CASE WHEN ${hasEnd}   THEN ${body.end_date ?? null}    ELSE end_date   END
    WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    RETURNING id, name, start_date, end_date
  `
  if (!updated) return cors(404, { error: 'Coverage not found' })
  const today = new Date().toISOString().slice(0, 10)
  return cors(200, { ok: true, coverage: { ...updated, is_active: updated.end_date >= today } })
}

async function remove(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const id = event.queryStringParameters?.id
  if (!id) return cors(400, { error: 'id is required' })

  const [deleted] = await sql`
    DELETE FROM unit_coverage WHERE id = ${id} AND tenant_id = ${TENANT_ID} RETURNING id
  `
  if (!deleted) return cors(404, { error: 'Coverage not found' })
  return cors(200, { ok: true })
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
