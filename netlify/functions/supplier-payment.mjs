// netlify/functions/supplier-payment.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  // CORS + preflight
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'POST') return createSupplierPayment(event);
  if (event.httpMethod === 'GET') return getSupplierPayment(event);
  if (event.httpMethod === 'PUT') return updateSupplierPayment(event);
  if (event.httpMethod === 'DELETE') return deleteSupplierPayment(event);
  return cors(405, { error: 'Method not allowed' });
}

async function createSupplierPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

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
  } catch (e) {
    console.error('supplier-payment create error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function getSupplierPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const id = (event.queryStringParameters?.id || '').trim();
    if (!id) return cors(400, { error: 'id required' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    const result = await sql`
      SELECT 
        sp.id,
        sp.supplier_id,
        sp.payment_type,
        sp.amount,
        sp.payment_date,
        sp.notes,
        sp.created_at,
        s.name AS supplier_name
      FROM supplier_payments sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.tenant_id = ${TENANT_ID} AND sp.id = ${id}
      LIMIT 1
    `;

    if (result.length === 0) return cors(404, { error: 'Payment not found' });

    return cors(200, { payment: result[0] });
  } catch (e) {
    console.error('supplier-payment get error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function updateSupplierPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    const { id, supplier_id, payment_type, amount, payment_date, notes } = JSON.parse(event.body);
    
    if (!id || !supplier_id || !payment_type || amount == null || !payment_date) {
      return cors(400, { error: 'Missing required fields' });
    }

    const result = await sql`
      UPDATE supplier_payments 
      SET 
        supplier_id = ${supplier_id},
        payment_type = ${payment_type},
        amount = ${amount},
        payment_date = ${payment_date},
        notes = ${notes || null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      RETURNING id
    `;

    if (result.length === 0) return cors(404, { error: 'Payment not found' });

    return cors(200, { ok: true });
  } catch (e) {
    console.error('supplier-payment update error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function deleteSupplierPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    const { id } = JSON.parse(event.body);
    
    if (!id) {
      return cors(400, { error: 'Missing id' });
    }

    const result = await sql`
      DELETE FROM supplier_payments 
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      RETURNING id
    `;

    if (result.length === 0) return cors(404, { error: 'Payment not found' });

    return cors(200, { ok: true });
  } catch (e) {
    console.error('supplier-payment delete error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,GET,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  };
}