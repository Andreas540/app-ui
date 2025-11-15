// netlify/functions/partner-debt-payment.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'POST') return createDebtPayment(event);
  return cors(405, { error: 'Method not allowed' });
}

async function createDebtPayment(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const {
      from_partner_id,
      to_partner_id,
      amount,
      payment_date,
      notes
    } = body || {};

    // Validation
    if (!from_partner_id) return cors(400, { error: 'from_partner_id is required' });
    if (!to_partner_id) return cors(400, { error: 'to_partner_id is required' });
    if (!payment_date) return cors(400, { error: 'payment_date is required' });
    
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return cors(400, { error: 'amount must be a positive number' });
    }

    const sql = neon(DATABASE_URL);

    // Verify both partners exist and belong to this tenant
    const partners = await sql`
      SELECT id, name FROM partners
      WHERE tenant_id = ${TENANT_ID}
        AND id IN (${from_partner_id}, ${to_partner_id})
    `;
    
    if (partners.length !== 2) {
      return cors(400, { error: 'Invalid partner IDs' });
    }

    const fromPartner = partners.find(p => p.id === from_partner_id);
    const toPartner = partners.find(p => p.id === to_partner_id);

    // Build notes with partner names
    const fullNotes = notes?.trim() 
      ? `Debt payment to ${toPartner.name} | ${notes.trim()}`
      : `Debt payment to ${toPartner.name}`;

    // 1. Insert into partner_payments (for paying partner only)
    // Positive amount reduces their "Owed to partner" balance
    const paymentRecord = await sql`
      INSERT INTO partner_payments (
        tenant_id, partner_id, payment_date, payment_type, amount, notes
      ) VALUES (
        ${TENANT_ID},
        ${from_partner_id},
        ${payment_date},
        'Partner debt payment',
        ${amountNum},
        ${fullNotes}
      )
      RETURNING id
    `;

    const partnerPaymentId = paymentRecord[0].id;

    // 2. Insert into partner_to_partner_debt_payments with link to partner_payments
    await sql`
      INSERT INTO partner_to_partner_debt_payments (
        tenant_id, from_partner_id, to_partner_id, amount, payment_date, notes, partner_payment_id
      ) VALUES (
        ${TENANT_ID},
        ${from_partner_id},
        ${to_partner_id},
        ${amountNum},
        ${payment_date},
        ${notes ?? null},
        ${partnerPaymentId}
      )
    `;

    return cors(200, { 
      ok: true,
      message: `Payment of $${amountNum.toFixed(2)} from ${fromPartner.name} to ${toPartner.name} recorded successfully`
    });

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