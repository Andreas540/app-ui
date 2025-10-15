// netlify/functions/price-checker.mjs

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
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
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const customerId = event.queryStringParameters?.customer_id;
    const productId = event.queryStringParameters?.product_id;

    if (!customerId || !productId) {
      return cors(400, { error: 'customer_id and product_id are required' });
    }

    const sql = neon(DATABASE_URL);

    // Get the most recent order's unit price for this customer/product combination
    const lastPrice = await sql`
      SELECT oi.unit_price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.customer_id = ${customerId}
        AND oi.product_id = ${productId}
      ORDER BY o.order_date DESC, o.created_at DESC
      LIMIT 1
    `;

    // Get the average unit price and order count for this customer/product combination
    const avgData = await sql`
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

    const averagePrice = avgData[0].average_price !== null
      ? Number(avgData[0].average_price)
      : null;

    const orderCount = avgData[0].order_count !== null
      ? Number(avgData[0].order_count)
      : 0;

    return cors(200, {
      price_last_time: priceLastTime,
      average_price: averagePrice,
      order_count: orderCount
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}