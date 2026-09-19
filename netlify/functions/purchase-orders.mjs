// netlify/functions/purchase-orders.mjs

import { resolveAuthz } from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('purchase-orders', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return list(event)
  if (event.httpMethod === 'POST')   return create(event)
  if (event.httpMethod === 'DELETE') return remove(event)
  return cors(405, { error: 'Method not allowed' })
})

async function migrate(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      po_number     TEXT NOT NULL,
      po_type       TEXT NOT NULL DEFAULT 'outbound',
      supplier_id   UUID,
      issue_date    DATE NOT NULL,
      exp_date      DATE,
      notes         TEXT,
      total_amount  NUMERIC,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `.catch(() => {})
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_tenant_po_number
      ON purchase_orders (tenant_id, po_number)
  `.catch(() => {})
  await sql`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      po_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id  UUID,
      qty         NUMERIC,
      unit_price  NUMERIC,
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `.catch(() => {})
}

async function list(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  await migrate(sql)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })

  const supplierId = event.queryStringParameters?.supplier_id

  const pos = await sql`
    SELECT
      po.id, po.po_number, po.po_type, po.supplier_id, po.issue_date, po.exp_date,
      po.notes, po.total_amount, po.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id',         poi.id,
            'product_id', poi.product_id,
            'product_name', p.name,
            'variant',    p.variant,
            'variant_2',  p.variant_2,
            'qty',        poi.qty,
            'unit_price', poi.unit_price
          ) ORDER BY poi.created_at
        ) FILTER (WHERE poi.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM purchase_orders po
    LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
    LEFT JOIN products p ON p.id = poi.product_id AND p.tenant_id = po.tenant_id
    WHERE po.tenant_id = ${authz.tenantId}
      ${supplierId ? sql`AND po.supplier_id = ${supplierId}` : sql``}
    GROUP BY po.id
    ORDER BY po.created_at DESC
  `
  return cors(200, { purchase_orders: pos })
}

async function create(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  await migrate(sql)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })

  const body = JSON.parse(event.body || '{}')
  const { supplier_id, po_number, issue_date, exp_date, notes, total_amount, items } = body

  if (!po_number?.trim()) return cors(400, { error: 'po_number is required' })
  if (!issue_date)         return cors(400, { error: 'issue_date is required' })

  const [po] = await sql`
    INSERT INTO purchase_orders (tenant_id, po_number, po_type, supplier_id, issue_date, exp_date, notes, total_amount)
    VALUES (
      ${authz.tenantId},
      ${po_number.trim()},
      'outbound',
      ${supplier_id || null},
      ${issue_date},
      ${exp_date || null},
      ${notes?.trim() || null},
      ${total_amount != null ? Number(total_amount) : null}
    )
    RETURNING id, po_number
  `

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      await sql`
        INSERT INTO purchase_order_items (po_id, product_id, qty, unit_price)
        VALUES (
          ${po.id},
          ${item.product_id || null},
          ${item.qty != null ? Number(item.qty) : null},
          ${item.unit_price != null ? Number(item.unit_price) : null}
        )
      `
    }
  }

  return cors(201, { id: po.id, po_number: po.po_number })
}

async function remove(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })

  const { id } = JSON.parse(event.body || '{}')
  if (!id) return cors(400, { error: 'id is required' })

  await sql`DELETE FROM purchase_orders WHERE id = ${id} AND tenant_id = ${authz.tenantId}`
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
