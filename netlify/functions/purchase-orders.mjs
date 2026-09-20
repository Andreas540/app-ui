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
      doc_data      TEXT,
      doc_name      TEXT,
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
  // Link supplier order lines to POs
  await sql`ALTER TABLE order_items_suppliers ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL`.catch(() => {})
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
      po.id, po.po_number, po.po_type, po.supplier_id, s.name AS supplier_name,
      po.issue_date, po.exp_date,
      po.notes, po.total_amount, po.doc_name, po.created_at,
      COALESCE(
        po.total_amount - (
          SELECT COALESCE(SUM(ois.qty * ois.product_cost), 0)
          FROM order_items_suppliers ois
          WHERE ois.purchase_order_id = po.id
        ),
        po.total_amount
      ) AS remaining_amount,
      COALESCE(
        json_agg(
          json_build_object(
            'id',         poi.id,
            'product_id', poi.product_id,
            'product_name', p.name,
            'variant',    p.variant,
            'variant_2',  p.variant_2,
            'qty',        poi.qty,
            'unit_price', poi.unit_price,
            'item_total', poi.qty * poi.unit_price,
            'consumed', (
              SELECT COALESCE(SUM(ois2.qty * ois2.product_cost), 0)
              FROM order_items_suppliers ois2
              WHERE ois2.purchase_order_id = po.id
                AND ois2.product_id = poi.product_id
            )
          ) ORDER BY poi.created_at
        ) FILTER (WHERE poi.id IS NOT NULL),
        '[]'::json
      ) AS items,
      (
        SELECT COALESCE(json_agg(ord_row ORDER BY ord_row.order_date DESC), '[]'::json)
        FROM (
          SELECT DISTINCT
            os.id,
            os.order_no,
            os.order_date::text,
            os.delivered,
            os.in_customs,
            os.received,
            COALESCE(SUM(ois2.qty * ois2.product_cost) FILTER (WHERE ois2.order_id = os.id), 0)::numeric(12,2) AS total,
            COALESCE((
              SELECT SUM(sp.amount) FROM supplier_payments sp
              WHERE sp.order_id = os.id AND sp.tenant_id = po.tenant_id
            ), 0)::numeric(12,2) AS paid_amount,
            (
              SELECT string_agg(label, ', ' ORDER BY label)
              FROM (
                SELECT DISTINCT CONCAT_WS(' · ',
                  p2.name,
                  NULLIF(p2.variant, ''),
                  NULLIF(p2.variant_2, '')
                ) AS label
                FROM order_items_suppliers ois3
                JOIN products p2 ON p2.id = ois3.product_id
                WHERE ois3.order_id = os.id
              ) pl
            ) AS products
          FROM order_items_suppliers ois
          JOIN orders_suppliers os ON os.id = ois.order_id
          LEFT JOIN order_items_suppliers ois2 ON ois2.order_id = os.id
          WHERE ois.purchase_order_id = po.id
          GROUP BY os.id, os.order_no, os.order_date, os.delivered, os.in_customs, os.received
        ) ord_row
      ) AS linked_orders
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id AND s.tenant_id = po.tenant_id
    LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
    LEFT JOIN products p ON p.id = poi.product_id AND p.tenant_id = po.tenant_id
    WHERE po.tenant_id = ${authz.tenantId}
      ${supplierId ? sql`AND po.supplier_id = ${supplierId}` : sql``}
    GROUP BY po.id, s.name
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
  const { supplier_id, po_number, issue_date, exp_date, notes, total_amount, doc_data, doc_name, items } = body

  if (!po_number?.trim()) return cors(400, { error: 'po_number is required' })
  if (!issue_date)         return cors(400, { error: 'issue_date is required' })

  // Add columns if they don't exist yet (for tenants that already have the table)
  await sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS doc_data TEXT`.catch(() => {})
  await sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS doc_name TEXT`.catch(() => {})

  const [po] = await sql`
    INSERT INTO purchase_orders (tenant_id, po_number, po_type, supplier_id, issue_date, exp_date, notes, total_amount, doc_data, doc_name)
    VALUES (
      ${authz.tenantId},
      ${po_number.trim()},
      'outbound',
      ${supplier_id || null},
      ${issue_date},
      ${exp_date || null},
      ${notes?.trim() || null},
      ${total_amount != null ? Number(total_amount) : null},
      ${doc_data || null},
      ${doc_name || null}
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
