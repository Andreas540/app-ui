// netlify/functions/payments.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')  return list(event);
  if (event.httpMethod === 'POST') return create(event);
  return cors(405, { error: 'Method not allowed' });
}

async function list(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const limit = Math.min(100, Math.max(1, parseInt(event.queryStringParameters?.limit ?? '20', 10) || 20));
    
    const rows = await sql`
      SELECT p.id, p.payment_date, p.payment_type, p.amount, p.notes,
             c.name AS customer_name, c.id AS customer_id
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.tenant_id = ${TENANT_ID}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${limit}
    `;
    return cors(200, { payments: rows });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function create(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return cors(400, { error: 'Invalid JSON body' }); }

    const {
      customer_id,
      payment_type,
      amount,
      payment_date,
      notes = null,
      order_id = null
    } = body;

    if (typeof customer_id !== 'string' || !customer_id) {
      return cors(400, { error: 'customer_id required' });
    }
    if (typeof payment_type !== 'string' || !payment_type) {
      return cors(400, { error: 'payment_type required' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      return cors(400, { error: 'amount must be a non-zero number' });
    }
    if (typeof payment_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      return cors(400, { error: 'payment_date must be YYYY-MM-DD' });
    }

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const [row] = await sql`
      INSERT INTO payments (tenant_id, customer_id, payment_type, amount, payment_date, notes, order_id)
      VALUES (${TENANT_ID}, ${customer_id}, ${payment_type}, ${amountNum}, ${payment_date}, ${notes}, ${order_id})
      RETURNING id
    `;
    return cors(200, { ok: true, id: row.id });
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
