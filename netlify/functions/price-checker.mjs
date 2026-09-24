// netlify/functions/price-checker.mjs

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
  if (event.httpMethod === 'GET') return getPriceData(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getPriceData(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const customerId = event.queryStringParameters?.customer_id;
    const productId = event.queryStringParameters?.product_id;

    if (!customerId || !productId) {
      return cors(400, { error: 'customer_id and product_id are required' });
    }

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const allCustomers = customerId === 'all';

    // Get effective customer price: customer override if set, otherwise product catalog price
    const customerPriceRows = allCustomers
      ? await sql`
          SELECT price_amount AS customer_price
          FROM products
          WHERE id = ${productId} AND tenant_id = ${TENANT_ID}
          LIMIT 1
        `
      : await sql`
          SELECT COALESCE(o.price_amount, p.price_amount) AS customer_price
          FROM products p
          LEFT JOIN customer_product_offers o
            ON  o.product_id   = p.id
            AND o.tenant_id    = p.tenant_id
            AND o.customer_id  = ${customerId}::uuid
          WHERE p.id = ${productId} AND p.tenant_id = ${TENANT_ID}
          LIMIT 1
        `;
    const customerPrice = customerPriceRows.length > 0 && customerPriceRows[0].customer_price != null
      ? Number(customerPriceRows[0].customer_price)
      : null;

    // Get the most recent order's unit price
    const lastPrice = allCustomers
      ? await sql`
          SELECT oi.unit_price, c.name AS customer_name, c.id AS customer_id
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.tenant_id = ${TENANT_ID}
            AND oi.product_id = ${productId}
          ORDER BY o.order_date DESC, o.created_at DESC
          LIMIT 1
        `
      : await sql`
          SELECT oi.unit_price, c.name AS customer_name, c.id AS customer_id
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.tenant_id = ${TENANT_ID}
            AND o.customer_id = ${customerId}
            AND oi.product_id = ${productId}
          ORDER BY o.order_date DESC, o.created_at DESC
          LIMIT 1
        `;

    // Get the average unit price and order count
    const avgData = allCustomers
      ? await sql`
          SELECT
            AVG(oi.unit_price)::numeric(12,2) as average_price,
            COUNT(DISTINCT o.id) as order_count
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID}
            AND oi.product_id = ${productId}
        `
      : await sql`
          SELECT
            AVG(oi.unit_price)::numeric(12,2) as average_price,
            COUNT(DISTINCT o.id) as order_count
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE o.tenant_id = ${TENANT_ID}
            AND o.customer_id = ${customerId}
            AND oi.product_id = ${productId}
        `;

    const priceLastTime = lastPrice.length > 0 && lastPrice[0].unit_price !== null
      ? Number(lastPrice[0].unit_price)
      : null;

    const lastSaleCustomer   = lastPrice.length > 0 ? (lastPrice[0].customer_name ?? null) : null;
    const lastSaleCustomerId = lastPrice.length > 0 ? (lastPrice[0].customer_id   ?? null) : null;

    const averagePrice = avgData[0].average_price !== null
      ? Number(avgData[0].average_price)
      : null;

    const orderCount = avgData[0].order_count !== null
      ? Number(avgData[0].order_count)
      : 0;

    return cors(200, {
      price_last_time: priceLastTime,
      last_sale_customer: lastSaleCustomer,
      last_sale_customer_id: lastSaleCustomerId,
      average_price: averagePrice,
      order_count: orderCount,
      customer_price: customerPrice,
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}