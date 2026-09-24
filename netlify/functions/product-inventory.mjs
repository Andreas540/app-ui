// GET /api/product-inventory?product_id=UUID
// Returns inventory snapshot for a single product.
import { resolveAuthz } from './utils/auth.mjs'

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const productId = event.queryStringParameters?.product_id
    if (!productId) return cors(400, { error: 'product_id required' })

    const rows = await sql`
      WITH committed AS (
        SELECT oi.product_id,
          SUM(GREATEST(oi.qty - oi.delivered_qty, 0)) AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.tenant_id = ${TENANT_ID}
          AND o.delivered = FALSE
          AND oi.qty > oi.delivered_qty
          AND oi.product_id = ${productId}::uuid
        GROUP BY oi.product_id
      ),
      on_order AS (
        SELECT ois.product_id,
          SUM(ois.qty - COALESCE(ois.qty_received, 0)) AS qty
        FROM order_items_suppliers ois
        JOIN orders_suppliers os ON os.id = ois.order_id
        WHERE os.tenant_id = ${TENANT_ID}
          AND ois.qty > COALESCE(ois.qty_received, 0)
          AND ois.product_id = ${productId}::uuid
        GROUP BY ois.product_id
      )
      SELECT
        ps.pre_prod,
        ps.finished,
        ps.on_hand                          AS qty,
        COALESCE(c.qty, 0)                 AS committed,
        COALESCE(oo.qty, 0)                AS on_order,
        ps.finished - COALESCE(c.qty, 0)  AS available_finished,
        ps.on_hand  - COALESCE(c.qty, 0)  AS available_total
      FROM product_stock ps
      LEFT JOIN committed c  ON c.product_id  = ${productId}::uuid
      LEFT JOIN on_order oo  ON oo.product_id = ${productId}::uuid
      WHERE ps.product_id = ${productId}::uuid
        AND ps.tenant_id  = ${TENANT_ID}
      LIMIT 1
    `

    if (!rows.length) return cors(200, { inventory: null })

    const r = rows[0]
    return cors(200, {
      inventory: {
        qty:                Number(r.qty ?? 0),
        pre_prod:           Number(r.pre_prod ?? 0),
        finished:           Number(r.finished ?? 0),
        committed:          Number(r.committed ?? 0),
        on_order:           Number(r.on_order ?? 0),
        available_finished: Number(r.available_finished ?? 0),
        available_total:    Number(r.available_total ?? 0),
      },
    })
  } catch (e) {
    console.error('product-inventory error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}
