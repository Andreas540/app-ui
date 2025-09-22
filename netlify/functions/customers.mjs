// netlify/functions/customers.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')    return listCustomers(event);
  if (event.httpMethod === 'POST')   return createCustomer(event);
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

    // Use LATERAL subqueries to avoid double-counting totals
    const rows = await sql`
      SELECT
        c.id,
        c.name,
        c.customer_type,
        COALESCE(tot.total_orders, 0)::numeric(12,2)  AS total_orders,
        COALESCE(pay.total_payments, 0)::numeric(12,2) AS total_payments,
        (COALESCE(tot.total_orders, 0) - COALESCE(pay.total_payments, 0))::numeric(12,2) AS owed_to_me
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT SUM(oi.qty * oi.unit_price) AS total_orders
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = c.id
      ) tot ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(p.amount) AS total_payments
        FROM payments p
        WHERE p.tenant_id = ${TENANT_ID} AND p.customer_id = c.id
      ) pay ON TRUE
      WHERE c.tenant_id = ${TENANT_ID}
        ${q ? sql`AND c.name ILIKE ${'%' + q + '%'}` : sql``}
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
      name, customer_type, shipping_cost,
      phone, address1, address2, city, state, postal_code
    } = body || {};

    if (!name || typeof name !== 'string') {
      return cors(400, { error: 'name is required' });
    }
    if (customer_type && !['BLV','Partner'].includes(customer_type)) {
      return cors(400, { error: 'invalid customer_type (BLV | Partner)' });
    }
    const sc = (shipping_cost === null || shipping_cost === undefined)
      ? null
      : Number(shipping_cost);
    if (shipping_cost !== undefined && shipping_cost !== null && !Number.isFinite(sc)) {
      return cors(400, { error: 'shipping_cost must be a number or null' });
    }

    const sql = neon(DATABASE_URL);
    const rows = await sql`
      INSERT INTO customers (
        tenant_id, name, customer_type, shipping_cost,
        phone, address1, address2, city, state, postal_code
      )
      VALUES (
        ${TENANT_ID}, ${name}, ${customer_type ?? null}, ${sc},
        ${phone ?? null}, ${address1 ?? null}, ${address2 ?? null},
        ${city ?? null}, ${state ?? null}, ${postal_code ?? null}
      )
      RETURNING id
    `;

    return cors(201, { ok: true, id: rows[0].id });
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

