// netlify/functions/last-price.mjs

import { resolveAuthz } from './utils/auth.mjs'

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getData(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getData(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const productId = event.queryStringParameters?.product_id;
    const customerId = event.queryStringParameters?.customer_id;
    const orderDate = event.queryStringParameters?.order_date;

    if (!productId || !customerId || !orderDate) {
      return cors(400, { error: 'product_id, customer_id, and order_date are required' });
    }

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    // Get the most recent order for this customer/product combination
    // that was placed BEFORE the current order date
    const result = await sql`
      SELECT oi.unit_price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.customer_id = ${customerId}
        AND oi.product_id = ${productId}
        AND o.order_date < ${orderDate}
      ORDER BY o.order_date DESC, o.created_at DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      // No previous order found - return null
      return cors(200, { unit_price: null });
    }

    const row = result[0];
    return cors(200, {
      unit_price: row.unit_price ? Number(row.unit_price) : null
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}
