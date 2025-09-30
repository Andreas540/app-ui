// netlify/functions/partner-payment.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'POST') return createPartnerPayment(event);
  return cors(405, { error: 'Method not allowed' });
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

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}