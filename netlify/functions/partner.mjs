export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getPartner(event);
  if (event.httpMethod === 'PUT') return updatePartner(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getPartner(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const id = (event.queryStringParameters?.id || '').trim();
    if (!id) return cors(400, { error: 'id required' });

    const sql = neon(DATABASE_URL);

    // Partner info
    const partnerRow = await sql`
      SELECT id, name, phone, address1, address2, city, state, postal_code
      FROM partners
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `;
    if (partnerRow.length === 0) return cors(404, { error: 'Partner not found' });
    const partner = partnerRow[0];

    // Totals for this partner
    const totals = await sql`
      SELECT
        (SELECT COALESCE(SUM(op.amount), 0)
           FROM order_partners op
          WHERE op.partner_id = ${id}) AS total_owed,
        (SELECT COALESCE(SUM(pp.amount), 0)
           FROM partner_payments pp
          WHERE pp.tenant_id = ${TENANT_ID}
            AND pp.partner_id = ${id}) AS total_paid
    `;
    const totalOwed = Number(totals[0].total_owed);
    const totalPaid = Number(totals[0].total_paid);
    const netOwed = totalOwed - totalPaid;

    /* Orders where this partner has a stake.
       We return:
       - order header fields
       - customer_name
       - total = SUM(qty*unit_price) across all lines
       - first line snapshot: product_name, qty, unit_price (typical one-line orders)
       - partner_amount = SUM(order_partners.amount) for THIS partner and order
    */
    const orders = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        c.name AS customer_name,
        -- full order total (sum of all lines)
        COALESCE(SUM(oi.qty * oi.unit_price), 0)::numeric(12,2) AS total,
        -- first line snapshot (product / qty / unit_price)
        fl.product_name,
        fl.qty,
        fl.unit_price,
        -- partner amount for THIS partner on this order
        pa.partner_amount
      FROM order_partners op
      JOIN orders o ON o.id = op.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      -- first line (by id) for display
      LEFT JOIN LATERAL (
        SELECT p.name AS product_name, oi2.qty, oi2.unit_price
        FROM order_items oi2
        JOIN products p ON p.id = oi2.product_id
        WHERE oi2.order_id = o.id
        ORDER BY oi2.id ASC
        LIMIT 1
      ) fl ON TRUE
      -- partner-specific amount for this order
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(op2.amount), 0)::numeric(12,2) AS partner_amount
        FROM order_partners op2
        WHERE op2.order_id = o.id
          AND op2.partner_id = ${id}
      ) pa ON TRUE
      WHERE op.partner_id = ${id}
        AND o.tenant_id = ${TENANT_ID}
      GROUP BY
        o.id, o.order_no, o.order_date, c.name,
        fl.product_name, fl.qty, fl.unit_price,
        pa.partner_amount
      ORDER BY o.order_date DESC, o.order_no DESC
      LIMIT 20
    `;

    // Payments to this partner
    const payments = await sql`
      SELECT id, payment_date, payment_type, amount
      FROM partner_payments
      WHERE tenant_id = ${TENANT_ID}
        AND partner_id = ${id}
      ORDER BY payment_date DESC
      LIMIT 20
    `;

    return cors(200, {
      partner,
      totals: {
        total_owed: totalOwed,
        total_paid: totalPaid,
        net_owed: netOwed
      },
      orders,
      payments
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function updatePartner(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const { id, name, phone, address1, address2, city, state, postal_code } = body || {};

    if (!id) return cors(400, { error: 'id is required' });
    if (!name || typeof name !== 'string') return cors(400, { error: 'name is required' });

    const sql = neon(DATABASE_URL);

    const res = await sql`
      UPDATE partners SET
        name = ${name},
        phone = ${phone ?? null},
        address1 = ${address1 ?? null},
        address2 = ${address2 ?? null},
        city = ${city ?? null},
        state = ${state ?? null},
        postal_code = ${postal_code ?? null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      RETURNING id
    `;
    
    if (res.length === 0) return cors(404, { error: 'Not found' });
    return cors(200, { ok: true });
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
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}
