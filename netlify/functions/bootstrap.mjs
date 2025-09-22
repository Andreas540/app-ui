// netlify/functions/bootstrap.mjs
export async function handler(event) {
  // CORS + preflight
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod !== 'GET')    return cors(405, { error: 'Method not allowed' });

  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);

    // Customers: we need customer_type here (NOT the old 'type')
    const customers = await sql`
      SELECT id, name, customer_type
      FROM customers
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    // Products (no unit_price here)
    const products = await sql`
      SELECT id, name
      FROM products
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    // Partners come from the dedicated partners table
    const partners = await sql`
      SELECT id, name
      FROM partners
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    return cors(200, { customers, products, partners });
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


