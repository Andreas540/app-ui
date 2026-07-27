// netlify/functions/product-bom.mjs
// CRUD for BOM recipes (product_boms + bom_items).
// GET  ?product_id=  — active recipe for a product (or service)
// POST              — create/replace recipe (new version, old deactivated)
// DELETE ?product_id= — deactivate all versions (removes recipe from product)

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('product-bom', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getBom(event)
  if (event.httpMethod === 'POST')   return saveBom(event)
  if (event.httpMethod === 'DELETE') return deleteBom(event)
  return cors(405, { error: 'Method not allowed' })
})

async function getBom(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const product_id = event.queryStringParameters?.product_id
  if (!product_id) return cors(400, { error: 'product_id required' })

  const boms = await sql`
    SELECT pb.id, pb.product_id, pb.version, pb.is_active, pb.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id',               bi.id,
            'input_product_id', bi.input_product_id,
            'input_name',       mp.name,
            'qty_per_unit',     bi.qty_per_unit
          ) ORDER BY bi.id
        ) FILTER (WHERE bi.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM product_boms pb
    LEFT JOIN bom_items bi ON bi.bom_id = pb.id
    LEFT JOIN products mp ON mp.id = bi.input_product_id
    WHERE pb.tenant_id = ${TENANT_ID}
      AND pb.product_id = ${product_id}
      AND pb.is_active = TRUE
    GROUP BY pb.id, pb.product_id, pb.version, pb.is_active, pb.created_at
    LIMIT 1
  `

  return cors(200, { bom: boms[0] ?? null })
}

async function saveBom(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const body = JSON.parse(event.body || '{}')
  const { product_id, items } = body

  if (!product_id) return cors(400, { error: 'product_id required' })
  if (!Array.isArray(items) || items.length === 0) return cors(400, { error: 'items[] required' })

  // Validate the product belongs to this tenant and is not a material itself
  const prods = await sql`
    SELECT id, category FROM products WHERE id = ${product_id} AND tenant_id = ${TENANT_ID} LIMIT 1
  `
  if (!prods.length) return cors(400, { error: 'Invalid product_id' })
  if (prods[0].category === 'material') return cors(400, { error: 'A material cannot have a recipe' })

  // Validate all input items are materials owned by this tenant
  for (const item of items) {
    if (!item.input_product_id) return cors(400, { error: 'input_product_id required for each item' })
    if (item.input_product_id === product_id) return cors(400, { error: 'A product cannot be its own input' })
    const qty = Number(item.qty_per_unit)
    if (!Number.isFinite(qty) || qty <= 0) return cors(400, { error: 'qty_per_unit must be > 0' })

    const mat = await sql`
      SELECT category FROM products WHERE id = ${item.input_product_id} AND tenant_id = ${TENANT_ID} LIMIT 1
    `
    if (!mat.length) return cors(400, { error: `Invalid input_product_id: ${item.input_product_id}` })
    if (mat[0].category !== 'material') return cors(400, { error: 'Recipe inputs must be materials' })
  }

  // Deactivate existing versions and get next version number
  const existing = await sql`
    UPDATE product_boms SET is_active = FALSE
    WHERE tenant_id = ${TENANT_ID} AND product_id = ${product_id}
    RETURNING version
  `
  const nextVersion = existing.length > 0 ? Math.max(...existing.map(r => r.version)) + 1 : 1

  // Insert new active version
  const [newBom] = await sql`
    INSERT INTO product_boms (tenant_id, product_id, version, is_active)
    VALUES (${TENANT_ID}, ${product_id}, ${nextVersion}, TRUE)
    RETURNING id, version
  `

  for (const item of items) {
    await sql`
      INSERT INTO bom_items (bom_id, input_product_id, qty_per_unit)
      VALUES (${newBom.id}, ${item.input_product_id}, ${Number(item.qty_per_unit)})
    `
  }

  return cors(200, { ok: true, bom_id: newBom.id, version: newBom.version })
}

async function deleteBom(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const product_id = event.queryStringParameters?.product_id
  if (!product_id) return cors(400, { error: 'product_id required' })

  await sql`
    UPDATE product_boms SET is_active = FALSE
    WHERE tenant_id = ${TENANT_ID} AND product_id = ${product_id}
  `

  return cors(200, { ok: true })
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
