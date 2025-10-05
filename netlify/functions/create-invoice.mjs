// netlify/functions/create-invoice.mjs

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
  if (event.httpMethod === 'GET') return getCustomers(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getCustomers(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);

    const customers = await sql`
      SELECT id, name, address1, address2, city, state, postal_code
      FROM customers
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name ASC
    `;

    return cors(200, { customers });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}