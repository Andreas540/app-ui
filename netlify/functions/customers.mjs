// netlify/functions/customers.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod !== 'GET')    return cors(405, { error: 'Method not allowed' });
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);
    const q = event.queryStringParameters?.q?.trim() ?? '';
    const like = `%${q}%`;

    const rows = await sql`
      WITH o AS (
        SELECT o.customer_id, SUM(oi.qty * oi.unit_price)::numeric(12,2) AS total_orders
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = ${TENANT_ID}
        GROUP BY o.customer_id
      ),
      p AS (
        SELECT customer_id, SUM(amount)::numeric(12,2) AS total_payments
        FROM payments
        WHERE tenant_id = ${TENANT_ID}
        GROUP BY customer_id
      )
      SELECT c.id, c.name, c.type,
             COALESCE(o.total_orders, 0) AS total_orders,
             COALESCE(p.total_payments, 0) AS total_payments,
             (COALESCE(o.total_orders,0) - COALESCE(p.total_payments,0)) AS owed_to_me
      FROM customers c
      LEFT JOIN o ON o.customer_id = c.id
      LEFT JOIN p ON p.customer_id = c.id
      WHERE c.tenant_id = ${TENANT_ID}
      ${q ? sql`AND c.name ILIKE ${like}` : sql``}
      ORDER BY c.name;
    `;
    return cors(200, { customers: rows });
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
