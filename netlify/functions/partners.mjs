// Create this file: netlify/functions/partners.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')     return listPartners(event);
  return cors(405, { error: 'Method not allowed' });
}

async function listPartners(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);
    const q = (event.queryStringParameters?.q || '').trim();
    const like = q ? `%${q.toLowerCase()}%` : null;

    const rows = await sql`
      SELECT
        p.id,
        p.name,
        COALESCE(t.total_owed, 0)::numeric(12,2) AS total_owed
      FROM partners p
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COALESCE(SUM(op.amount), 0)
             FROM orders o
             JOIN order_partners op ON op.order_id = o.id
            WHERE o.tenant_id = ${TENANT_ID}
              AND op.partner_id = p.id) AS total_owed
      ) t ON TRUE
      WHERE p.tenant_id = ${TENANT_ID}
        ${like ? sql`AND LOWER(p.name) LIKE ${like}` : sql``}
      ORDER BY p.name
    `;

    return cors(200, { partners: rows });
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