// Create this file: netlify/functions/recent-orders.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getRecentOrders(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getRecentOrders(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);

    // Get the 15 most recent orders across all customers
    const orders = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        o.delivered,
        o.notes,
        c.name as customer_name,
        -- full order total
        COALESCE(SUM(oi.qty * oi.unit_price),0)::numeric(12,2) AS total,
        COUNT(oi.id) AS lines,
        -- first line snapshot
        fl.product_name,
        fl.qty,
        fl.unit_price
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT p.name AS product_name, oi2.qty, oi2.unit_price
        FROM order_items oi2
        JOIN products p ON p.id = oi2.product_id
        WHERE oi2.order_id = o.id
        ORDER BY oi2.id ASC
        LIMIT 1
      ) fl ON true
      WHERE o.tenant_id = ${TENANT_ID}
      GROUP BY o.id, o.order_no, o.order_date, o.delivered, c.name, fl.product_name, fl.qty, fl.unit_price
      ORDER BY o.order_no DESC, o.id DESC
      LIMIT 15
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
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}