// netlify/functions/product-cost-history.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getProductCostHistory(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getProductCostHistory(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    // Get all historical costs with product names, converted to America/New_York time
    const history = await sql`
      SELECT 
        pch.product_id,
        p.name as product_name,
        pch.cost,
        (pch.effective_from AT TIME ZONE 'America/New_York')::timestamp as effective_from
      FROM public.product_cost_history pch
      JOIN public.products p
        ON p.id = pch.product_id
       AND p.tenant_id = pch.tenant_id
      WHERE pch.tenant_id = ${TENANT_ID}
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}
