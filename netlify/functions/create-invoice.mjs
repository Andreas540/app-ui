// netlify/functions/create-invoice.mjs

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

    const customerId = event.queryStringParameters?.customerId;
    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    // Get all customers for dropdown
    const customers = await sql`
      SELECT id, name, company_name, address1, address2, city, state, postal_code
      FROM customers
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name ASC
    `;

    // If customerId provided, get their orders
    let orders = [];
    if (customerId) {
      orders = await sql`
        SELECT 
          o.id as order_id,
          oi.id as item_id,
          p.name as product,
          oi.qty as quantity,
          oi.unit_price,
          (oi.qty * oi.unit_price) as amount,
          o.order_date
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.customer_id = ${customerId}
          AND o.tenant_id = ${TENANT_ID}
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT 20
      `;
    }

    return cors(200, { customers, orders });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}