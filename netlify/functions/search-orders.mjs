// netlify/functions/search-orders.mjs
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return searchOrders(event);
  return cors(405, { error: 'Method not allowed' });
}

async function searchOrders(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const params = event.queryStringParameters ?? {};
    const q          = params.q?.trim() || null;
    const fromDate   = params.from_date || null;
    const toDate     = params.to_date   || null;
    const minAmount  = params.min_amount != null ? Number(params.min_amount) : null;
    const maxAmount  = params.max_amount != null ? Number(params.max_amount) : null;

    const hasSearch = q || fromDate || toDate || minAmount != null || maxAmount != null;

    const orders = await sql`
      WITH order_totals AS (
        SELECT
          oi.order_id,
          COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric(12,2) AS total,
          string_agg(DISTINCT p.name, ', ' ORDER BY p.name) AS product_list
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id AND p.tenant_id = ${TENANT_ID}
        GROUP BY oi.order_id
      )
      SELECT
        o.id,
        o.order_no,
        o.order_date::text,
        o.delivered,
        o.notes,
        c.id   AS customer_id,
        c.name AS customer_name,
        COALESCE(ot.total, 0)        AS total,
        COALESCE((
          SELECT SUM(py.amount) FROM payments py WHERE py.order_id = o.id
        ), 0)::numeric(12,2)         AS paid_amount,
        COALESCE(ot.product_list, '') AS product_list
      FROM orders o
      LEFT JOIN customers    c  ON c.id = o.customer_id
      LEFT JOIN order_totals ot ON ot.order_id = o.id
      WHERE o.tenant_id = ${TENANT_ID}
        ${q ? sql`AND (
          c.name       ILIKE ${'%' + q + '%'} OR
          o.order_no::text ILIKE ${'%' + q + '%'} OR
          ot.product_list  ILIKE ${'%' + q + '%'}
        )` : sql``}
        ${fromDate ? sql`AND o.order_date >= ${fromDate}::date` : sql``}
        ${toDate   ? sql`AND o.order_date <= ${toDate}::date`   : sql``}
        ${minAmount != null ? sql`AND COALESCE(ot.total, 0) >= ${minAmount}` : sql``}
        ${maxAmount != null ? sql`AND COALESCE(ot.total, 0) <= ${maxAmount}` : sql``}
      ORDER BY o.order_date DESC, o.order_no DESC
      ${hasSearch ? sql`` : sql`LIMIT 50`}
    `;

    return cors(200, { orders });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  };
}
