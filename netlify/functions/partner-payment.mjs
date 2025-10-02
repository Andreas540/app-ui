// netlify/functions/partner-payment.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')    return getPartnerPayment(event);
  if (event.httpMethod === 'POST')   return createPartnerPayment(event);
  if (event.httpMethod === 'PUT')    return updatePartnerPayment(event);
  if (event.httpMethod === 'DELETE') return deletePartnerPayment(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getPartnerPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const id = (event.queryStringParameters?.id || '').trim();
    if (!id) return cors(400, { error: 'id required' });

    const sql = neon(DATABASE_URL);

    const payments = await sql`
      SELECT pp.id, pp.partner_id, pp.payment_type, pp.amount, pp.payment_date, pp.notes,
             p.name AS partner_name
      FROM partner_payments pp
      JOIN partners p ON p.id = pp.partner_id
      WHERE pp.tenant_id = ${TENANT_ID} AND pp.id = ${id}
      LIMIT 1
    `;
    
    if (payments.length === 0) return cors(404, { error: 'Payment not found' });

    return cors(200, { payment: payments[0] });
  } catch (e) {
    console.error('getPartnerPayment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function createPartnerPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const { partner_id, payment_type, amount, payment_date, notes } = body || {};

    if (!partner_id || typeof partner_id !== 'string') {
      return cors(400, { error: 'partner_id is required' });
    }
    if (!payment_type || typeof payment_type !== 'string') {
      return cors(400, { error: 'payment_type is required' });
    }
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum === 0) {
      return cors(400, { error: 'amount must be a non-zero number' });
    }
    if (!payment_date) {
      return cors(400, { error: 'payment_date is required' });
    }

    const sql = neon(DATABASE_URL);

    // Verify partner exists and belongs to tenant
    const partnerCheck = await sql`
      SELECT id FROM partners
      WHERE id = ${partner_id} AND tenant_id = ${TENANT_ID}
      LIMIT 1
    `;
    if (partnerCheck.length === 0) {
      return cors(404, { error: 'Partner not found' });
    }

    // Insert partner payment
    const result = await sql`
      INSERT INTO partner_payments (tenant_id, partner_id, payment_type, amount, payment_date, notes)
      VALUES (${TENANT_ID}, ${partner_id}, ${payment_type}, ${amtNum}, ${payment_date}, ${notes || null})
      RETURNING id
    `;

    return cors(201, { ok: true, id: result[0].id });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function updatePartnerPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const { id, partner_id, payment_type, amount, payment_date, notes } = body;

    if (!id) return cors(400, { error: 'id is required' });
    if (!partner_id) return cors(400, { error: 'partner_id is required' });
    if (!payment_type || typeof payment_type !== 'string') {
      return cors(400, { error: 'payment_type is required' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      return cors(400, { error: 'amount must be a non-zero number' });
    }
    if (!payment_date) return cors(400, { error: 'payment_date is required' });

    const sql = neon(DATABASE_URL);

    await sql`
      UPDATE partner_payments
      SET partner_id = ${partner_id},
          payment_type = ${payment_type},
          amount = ${amountNum},
          payment_date = ${payment_date},
          notes = ${notes || null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `;

    return cors(200, { ok: true });
  } catch (e) {
    console.error('updatePartnerPayment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function deletePartnerPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const { id } = body;

    if (!id) return cors(400, { error: 'id is required' });

    const sql = neon(DATABASE_URL);

    await sql`
      DELETE FROM partner_payments
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `;

    return cors(200, { ok: true });
  } catch (e) {
    console.error('deletePartnerPayment error:', e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}