// netlify/functions/product-cost-history.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getProductCostHistory(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getProductCostHistory(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);

    // Get all historical costs with product names, converted to EST
    const history = await sql`
      SELECT 
        pch.product_id,
        p.name as product_name,
        pch.cost,
        (pch.effective_from AT TIME ZONE 'America/New_York')::timestamp as effective_from
      FROM product_cost_history pch
      JOIN products p ON p.id = pch.product_id
      WHERE p.tenant_id = ${TENANT_ID}
      ORDER BY p.name ASC, pch.effective_from DESC
    `;

    return cors(200, history);
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