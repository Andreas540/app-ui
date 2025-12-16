// netlify/functions/historical-costs.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getHistoricalCosts(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getHistoricalCosts(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const { product_id, customer_id, order_date } = event.queryStringParameters || {};
    
    if (!product_id || !customer_id || !order_date) {
      return cors(400, { error: 'product_id, customer_id, and order_date required' });
    }

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    // Convert order_date (YYYY-MM-DD) to end of day in EST, then to UTC for comparison
    // This ensures we catch any changes made "today" in EST
    const orderDateEndOfDayEST = `${order_date}T23:59:59-05:00`; // End of day EST

    // Get product cost from history
    const productCost = await sql`
      SELECT cost
      FROM product_cost_history
      WHERE product_id = ${product_id}
        AND effective_from <= ${orderDateEndOfDayEST}::timestamptz
      ORDER BY effective_from DESC
      LIMIT 1
    `;

    // Get shipping cost from history
    const shippingCost = await sql`
      SELECT shipping_cost
      FROM shipping_cost_history
      WHERE tenant_id = ${TENANT_ID}
        AND customer_id = ${customer_id}
        AND effective_from <= ${orderDateEndOfDayEST}::timestamptz
      ORDER BY effective_from DESC
      LIMIT 1
    `;

    return cors(200, {
      product_cost: productCost.length ? Number(productCost[0].cost) : null,
      shipping_cost: shippingCost.length ? Number(shippingCost[0].shipping_cost) : null
    });
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}