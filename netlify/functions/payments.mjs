// netlify/functions/payments.mjs

const TYPES = [
  'Cash payment','Cash App payment','Credit payment','Shipping fee',
  'Discount','Credit','Old tab','Wire Payment','Zelle payment'
];

export async function handler(event) {
  // CORS + preflight
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);

    if (event.httpMethod === 'GET') {
      // list recent payments (default 20)
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
    }

    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return cors(400, { error: 'Invalid JSON body' }); }

      const {
        customer_id,
        payment_type,
        amount,      // can be positive or negative
        payment_date,
        notes = null,
        order_id = null       // optional future linkage
      } = body;

      if (typeof customer_id !== 'string' || !customer_id) return cors(400, { error: 'customer_id required' });
      if (typeof payment_type !== 'string' || !TYPES.includes(payment_type)) {
        return cors(400, { error: 'payment_type invalid', allowed: TYPES });
      }
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum === 0) {
        return cors(400, { error: 'amount must be a non-zero number' });
      }
      if (typeof payment_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
        return cors(400, { error: 'payment_date must be YYYY-MM-DD' });
      }

      // Insert
      const [row] = await sql`
        INSERT INTO payments (tenant_id, customer_id, payment_type, amount, payment_date, notes, order_id)
        VALUES (${TENANT_ID}, ${customer_id}, ${payment_type}, ${amountNum}, ${payment_date}, ${notes}, ${order_id})
        RETURNING id
      `;
      return cors(200, { ok: true, id: row.id });
    }

    return cors(405, { error: 'Method not allowed' });
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
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}
