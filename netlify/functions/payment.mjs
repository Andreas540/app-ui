// netlify/functions/payment.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')    return getPayment(event);
  if (event.httpMethod === 'PUT')    return updatePayment(event);
  if (event.httpMethod === 'DELETE') return deletePayment(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const id = (event.queryStringParameters?.id || '').trim();
    if (!id) return cors(400, { error: 'id required' });

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    const payments = await sql`
      SELECT p.id, p.customer_id, p.payment_type, p.amount, p.payment_date, p.notes,
             c.name AS customer_name
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.tenant_id = ${TENANT_ID} AND p.id = ${id}
      LIMIT 1
    `;
    
    if (payments.length === 0) return cors(404, { error: 'Payment not found' });
    return cors(200, { payment: payments[0] });
  } catch (e) {
    console.error('getPayment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function updatePayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const { id, customer_id, payment_type, amount, payment_date, notes } = body;

    if (!id) return cors(400, { error: 'id is required' });
    if (!customer_id) return cors(400, { error: 'customer_id is required' });
    if (!payment_type || typeof payment_type !== 'string') {
      return cors(400, { error: 'payment_type is required' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      return cors(400, { error: 'amount must be a non-zero number' });
    }
    if (!payment_date) return cors(400, { error: 'payment_date is required' });

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    await sql`
      UPDATE payments
      SET customer_id = ${customer_id},
          payment_type = ${payment_type},
          amount = ${amountNum},
          payment_date = ${payment_date},
          notes = ${notes || null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `;

    return cors(200, { ok: true });
  } catch (e) {
    console.error('updatePayment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function deletePayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const { id } = body;
    if (!id) return cors(400, { error: 'id is required' });

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    await sql`
      DELETE FROM payments
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `;

    return cors(200, { ok: true });
  } catch (e) {
    console.error('deletePayment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}