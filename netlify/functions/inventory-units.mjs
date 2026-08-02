// netlify/functions/inventory-units.mjs
// CRUD for inventory_units (named, individually-tracked copies of a product).
//
// GET    ?product_id=<uuid>[&status=Inventory|Listed|Sold]  — list units
// POST   { product_id, serial_number?, condition?, notes?, acquired_at? }  — create (promote)
// PUT    { id, serial_number?, condition?, listing_status?, notes?, order_item_id? }  — update
// DELETE ?id=<bigint>  — demote (only unsold units; FK blocks units tied to active order lines)

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('inventory-units', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return listUnits(event)
  if (event.httpMethod === 'POST')   return createUnit(event)
  if (event.httpMethod === 'PUT')    return updateUnit(event)
  if (event.httpMethod === 'DELETE') return demoteUnit(event)
  return cors(405, { error: 'Method not allowed' })
})

async function listUnits(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const params = new URLSearchParams(event.queryStringParameters || {})
  const productId = params.get('product_id')
  const status    = params.get('status') // optional filter

  if (!productId) return cors(400, { error: 'product_id required' })

  const units = await sql`
    SELECT
      iu.id, iu.product_id, iu.serial_number, iu.condition,
      iu.listing_status, iu.order_item_id, iu.acquired_at,
      iu.notes, iu.created_at, iu.updated_at,
      -- Order info when claimed/sold
      o.id AS order_id, o.order_no, c.name AS customer_name
    FROM inventory_units iu
    LEFT JOIN order_items oi ON oi.id = iu.order_item_id
    LEFT JOIN orders       o  ON o.id  = oi.order_id
    LEFT JOIN customers    c  ON c.id  = o.customer_id
    WHERE iu.tenant_id  = ${TENANT_ID}
      AND iu.product_id = ${productId}
      AND (${status ?? null} IS NULL OR iu.listing_status = ${status ?? null})
    ORDER BY iu.listing_status, iu.created_at DESC
  `
  return cors(200, { units })
}

async function createUnit(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const body = JSON.parse(event.body || '{}')
  const { product_id, serial_number, condition, notes, acquired_at } = body

  if (!product_id) return cors(400, { error: 'product_id required' })

  // Confirm product belongs to this tenant and supports unit tracking
  const [prod] = await sql`
    SELECT id, unit_tracking FROM products
    WHERE id = ${product_id} AND tenant_id = ${TENANT_ID} LIMIT 1
  `
  if (!prod) return cors(404, { error: 'Product not found' })
  if (prod.unit_tracking === 'none') {
    return cors(409, { error: 'This product does not have unit tracking enabled.' })
  }

  const [unit] = await sql`
    INSERT INTO inventory_units (
      tenant_id, product_id, serial_number, condition,
      listing_status, notes, acquired_at
    )
    VALUES (
      ${TENANT_ID}, ${product_id},
      ${serial_number?.trim() || null},
      ${condition?.trim() || null},
      'Inventory',
      ${notes?.trim() || null},
      ${acquired_at || null}
    )
    RETURNING *
  `
  return cors(201, { unit })
}

async function updateUnit(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const body = JSON.parse(event.body || '{}')
  const { id } = body
  if (!id) return cors(400, { error: 'id required' })

  const [existing] = await sql`
    SELECT id, listing_status, order_item_id
    FROM inventory_units WHERE id = ${id} AND tenant_id = ${TENANT_ID} LIMIT 1
  `
  if (!existing) return cors(404, { error: 'Unit not found' })

  // 'Sold' may only be set by the delivery trigger, not manually
  const newStatus = body.listing_status
  if (newStatus === 'Sold' && existing.listing_status !== 'Sold') {
    return cors(409, { error: 'Sold status is set automatically on delivery.' })
  }
  // Cannot un-sell (Sold → anything else) — that requires order reversal
  if (existing.listing_status === 'Sold' && newStatus && newStatus !== 'Sold') {
    return cors(409, { error: 'A sold unit cannot be manually un-sold. Reverse the delivery instead.' })
  }

  const hasSerial   = 'serial_number'  in body
  const hasCondition = 'condition'     in body
  const hasStatus   = 'listing_status' in body
  const hasNotes    = 'notes'          in body
  const hasOrderItem = 'order_item_id' in body
  const hasAcquired  = 'acquired_at'   in body

  // Claim: when order_item_id is set, unit goes Listed; when cleared, back to Inventory.
  let resolvedStatus = newStatus
  if (hasOrderItem && !hasStatus) {
    resolvedStatus = body.order_item_id ? 'Listed' : 'Inventory'
  }

  const [unit] = await sql`
    UPDATE inventory_units SET
      serial_number  = CASE WHEN ${hasSerial}    THEN ${body.serial_number?.trim() || null} ELSE serial_number  END,
      condition      = CASE WHEN ${hasCondition} THEN ${body.condition?.trim()     || null} ELSE condition      END,
      listing_status = CASE WHEN ${hasStatus || hasOrderItem} THEN ${resolvedStatus ?? null} ELSE listing_status END,
      notes          = CASE WHEN ${hasNotes}     THEN ${body.notes?.trim()          || null} ELSE notes          END,
      order_item_id  = CASE WHEN ${hasOrderItem} THEN ${body.order_item_id         || null} ELSE order_item_id  END,
      acquired_at    = CASE WHEN ${hasAcquired}  THEN ${body.acquired_at            || null} ELSE acquired_at    END
    WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    RETURNING *
  `
  return cors(200, { unit })
}

async function demoteUnit(event) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const TENANT_ID = authz.tenantId

  const id = event.queryStringParameters?.id
  if (!id) return cors(400, { error: 'id required' })

  const [unit] = await sql`
    SELECT id, listing_status FROM inventory_units
    WHERE id = ${id} AND tenant_id = ${TENANT_ID} LIMIT 1
  `
  if (!unit) return cors(404, { error: 'Unit not found' })
  if (unit.listing_status === 'Sold') {
    return cors(409, { error: 'Sold units cannot be demoted. Reverse the delivery first.' })
  }

  // The FK on order_item_id (ON DELETE RESTRICT) blocks deletion if claimed by an active order.
  try {
    await sql`DELETE FROM inventory_units WHERE id = ${id} AND tenant_id = ${TENANT_ID}`
    return cors(200, { ok: true })
  } catch (e) {
    if (String(e).includes('restrict') || String(e).includes('violates foreign key')) {
      return cors(409, { error: 'This unit is reserved on an active order line and cannot be removed.' })
    }
    throw e
  }
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
