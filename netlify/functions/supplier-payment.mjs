// netlify/functions/supplier-payment.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  // CORS + preflight
  if (event.httpMethod === 'OPTIONS') return cors(204, {});

  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    if (event.httpMethod === 'POST') {
      const { supplier_id, payment_type, amount, payment_date, notes } = JSON.parse(event.body);
      
      if (!supplier_id || !payment_type || amount == null || !payment_date) {
        return cors(400, { error: 'Missing required fields' });
      }

      const result = await sql`
        INSERT INTO supplier_payments (tenant_id, supplier_id, payment_type, amount, payment_date, notes)
        VALUES (${TENANT_ID}, ${supplier_id}, ${payment_type}, ${amount}, ${payment_date}, ${notes || null})
        RETURNING id
      `;

      return cors(200, { ok: true, id: result[0].id });
    }

    return cors(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('supplier-payment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  };
}