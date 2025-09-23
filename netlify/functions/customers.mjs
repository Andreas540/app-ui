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

    const q = (event.queryStringParameters?.q || '').trim();
    const nameFilter = q ? `%${q}%` : null;

    // Return customers with totals and owed_to_partners
    const rows = await sql`
      SELECT
        c.id,
        c.name,
        c.customer_type,
        COALESCE(t.total_orders, 0)::numeric(12,2)      AS total_orders,
        COALESCE(t.total_payments, 0)::numeric(12,2)    AS total_payments,
        COALESCE(op.owed_to_partners, 0)::numeric(12,2) AS owed_to_partners,
        (COALESCE(t.total_orders,0) - COALESCE(t.total_payments,0))::numeric(12,2) AS owed_to_me
      FROM customers c

      -- Orders (+ items) & Payments totals for this customer
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(oi.qty * oi.unit_price), 0) AS total_orders,
          (
            SELECT COALESCE(SUM(p.amount), 0)
            FROM payments p
            WHERE p.tenant_id = c.tenant_id
              AND p.customer_id = c.id
          ) AS total_payments
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = c.tenant_id
          AND o.customer_id = c.id
      ) t ON true

      -- Partners share for all orders belonging to this customer
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(op.amount), 0) AS owed_to_partners
        FROM orders o
        JOIN order_partners op ON op.order_id = o.id
        WHERE o.tenant_id = c.tenant_id
          AND o.customer_id = c.id
      ) op ON true

      WHERE c.tenant_id = ${TENANT_ID}
        ${nameFilter ? sql`AND c.name ILIKE ${nameFilter}` : sql``}

      ORDER BY c.name
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


