// netlify/functions/customers.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')     return listCustomers(event);
  if (event.httpMethod === 'POST')    return createCustomer(event);
  return cors(405, { error: 'Method not allowed' });
}

async function listCustomers(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);
    const q = (event.queryStringParameters?.q || '').trim();
    const like = q ? `%${q.toLowerCase()}%` : null;

    const rows = await sql`
      SELECT
        c.id,
        c.name,
        c.customer_type,
        COALESCE(t.total_orders, 0)::numeric(12,2)   AS total_orders,
        COALESCE(t.total_payments, 0)::numeric(12,2) AS total_payments,
        COALESCE(t.owed_to_partners, 0)::numeric(12,2) AS owed_to_partners,
        (COALESCE(t.total_orders, 0) - COALESCE(t.total_payments, 0))::numeric(12,2) AS owed_to_me
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
            WHERE o.tenant_id = ${TENANT_ID}
              AND o.customer_id = c.id) AS total_orders,
          (SELECT COALESCE(SUM(p.amount), 0)
             FROM payments p
            WHERE p.tenant_id = ${TENANT_ID}
              AND p.customer_id = c.id) AS total_payments,
          (
            (SELECT COALESCE(SUM(op.amount), 0)
               FROM orders o
               JOIN order_partners op ON op.order_id = o.id
              WHERE o.tenant_id = ${TENANT_ID}
                AND o.customer_id = c.id)
            -
            (SELECT COALESCE(SUM(pp.amount), 0)
               FROM partner_payments pp
               JOIN order_partners op ON op.partner_id = pp.partner_id
               JOIN orders o ON o.id = op.order_id
              WHERE pp.tenant_id = ${TENANT_ID}
                AND o.customer_id = c.id)
          ) AS owed_to_partners
      ) t ON TRUE
      WHERE c.tenant_id = ${TENANT_ID}
        ${like ? sql`AND LOWER(c.name) LIKE ${like}` : sql``}
      ORDER BY c.name
    `;

    return cors(200, { customers: rows });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function createCustomer(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');

    const {
      name,
      customer_type,
      shipping_cost,
      phone,
      address1,
      address2,
      city,
      state,
      postal_code,
    } = body || {};

    if (!name || typeof name !== 'string') {
      return cors(400, { error: 'name is required' });
    }
    if (!['BLV', 'Partner'].includes(customer_type)) {
      return cors(400, { error: 'customer_type must be BLV or Partner' });
    }

    let ship = null;
    if (shipping_cost !== undefined && shipping_cost !== null) {
      const n = Number(shipping_cost);
      if (!Number.isFinite(n) || n < 0) {
        return cors(400, { error: 'shipping_cost must be a non-negative number (or omitted)' });
      }
      ship = n;
    }

    const sql = neon(DATABASE_URL);

    const ins = await sql`
      INSERT INTO customers (
        tenant_id, name, customer_type, shipping_cost,
        phone, address1, address2, city, state, postal_code
      ) VALUES (
        ${TENANT_ID}, ${name.trim()}, ${customer_type}, ${ship},
        ${phone ?? null}, ${address1 ?? null}, ${address2 ?? null},
        ${city ?? null}, ${state ?? null}, ${postal_code ?? null}
      )
      RETURNING id
    `;

    return cors(200, { ok: true, id: ins[0].id });
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



