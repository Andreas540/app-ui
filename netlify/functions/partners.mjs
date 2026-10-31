// netlify/functions/partners.mjs
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')     return listPartners(event);
  if (event.httpMethod === 'POST')    return createPartner(event);
  return cors(405, { error: 'Method not allowed' });
}

async function listPartners(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const q = (event.queryStringParameters?.q || '').trim();
    const like = q ? `%${q.toLowerCase()}%` : null;

    const rows = await sql`
      SELECT
        p.id,
        p.name,
        COALESCE(t.total_owed, 0)::numeric(12,2) AS total_owed,
        ts.sort_order
      FROM partners p
      LEFT JOIN tenant_partner_sort ts
        ON ts.partner_id = p.id AND ts.tenant_id = ${TENANT_ID}
      LEFT JOIN LATERAL (
        SELECT
          (
            (SELECT COALESCE(SUM(op.amount), 0)
               FROM order_partners op
              WHERE op.partner_id = p.id)
            -
            (SELECT COALESCE(SUM(pp.amount), 0)
               FROM partner_payments pp
              WHERE pp.tenant_id = ${TENANT_ID}
                AND pp.partner_id = p.id)
          ) AS total_owed
      ) t ON TRUE
      WHERE p.tenant_id = ${TENANT_ID}
        AND NOT EXISTS (
          SELECT 1 FROM tenant_hidden_partners thp
          WHERE thp.tenant_id = ${TENANT_ID} AND thp.partner_id = p.id
        )
        ${like ? sql`AND LOWER(p.name) LIKE ${like}` : sql``}
      ORDER BY p.name
    `;

    // Returned on every fetch so admin changes apply without the user re-logging in.
    const [s] = await sql`SELECT default_partner_sort, partner_sort_use_custom FROM tenants WHERE id = ${TENANT_ID}`;

    return cors(200, {
      partners: rows,
      defaultSort: s?.default_partner_sort ?? 'name',
      useCustom:   s?.partner_sort_use_custom ?? false,
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function createPartner(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const { name, phone, address1, address2, city, state, postal_code } = body || {};

    if (!name || typeof name !== 'string') {
      return cors(400, { error: 'name is required' });
    }

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const ins = await sql`
      INSERT INTO partners (
        tenant_id, name, phone, address1, address2, city, state, postal_code
      ) VALUES (
        ${TENANT_ID}, ${name.trim()}, ${phone ?? null}, ${address1 ?? null}, 
        ${address2 ?? null}, ${city ?? null}, ${state ?? null}, ${postal_code ?? null}
      )
      RETURNING id
    `;

    return cors(201, { ok: true, id: ins[0].id });
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
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}