// netlify/functions/orders.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'POST')    return createOrder(event);
  return cors(405, { error: 'Method not allowed' });
}

async function createOrder(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const { customer_id, product_id, qty, unit_price, date, delivered, discount } = body || {};

    const qtyInt = parseInt(qty, 10);
    const unitPriceNum = Number(unit_price);

    if (!customer_id || !product_id || !qtyInt || !unitPriceNum || !date) {
      return cors(400, { error: 'Missing fields: customer_id, product_id, qty, unit_price, date' });
    }
    if (!(qtyInt > 0)) return cors(400, { error: 'qty must be > 0' });

    const sql = neon(DATABASE_URL);

    // Next order number per-tenant
    const nextNo = await sql`
      SELECT COALESCE(MAX(order_no),0) + 1 AS n
      FROM orders
      WHERE tenant_id = ${TENANT_ID}
    `;
    const orderNo = Number(nextNo[0].n) || 1;

    // Create order header
    const hdr = await sql`
      INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, discount)
      VALUES (${TENANT_ID}, ${customer_id}, ${orderNo}, ${date}, ${!!delivered}, ${discount ?? 0})
      RETURNING id
    `;
    const orderId = hdr[0].id;

    // Snapshot cost from history:
    // 1) prefer the last history row effective on or before the order date
    // 2) else fall back to the earliest history row
    // 3) else fall back to products.cost (if any)
    let snapshotCost = null;

    const h1 = await sql`
      SELECT cost
      FROM product_cost_history
      WHERE product_id = ${product_id}
        AND effective_from::date <= ${date}
      ORDER BY effective_from DESC
      LIMIT 1
    `;
    if (h1.length > 0) {
      snapshotCost = Number(h1[0].cost);
    } else {
      const h2 = await sql`
        SELECT cost
        FROM product_cost_history
        WHERE product_id = ${product_id}
        ORDER BY effective_from ASC
        LIMIT 1
      `;
      if (h2.length > 0) {
        snapshotCost = Number(h2[0].cost);
      } else {
        const p = await sql`
          SELECT cost
          FROM products
          WHERE id = ${product_id} AND tenant_id = ${TENANT_ID}
          LIMIT 1
        `;
        if (p.length > 0 && p[0].cost !== null) snapshotCost = Number(p[0].cost);
      }
    }

    // Insert order line with snapshotted cost
    const line = await sql`
      INSERT INTO order_items (order_id, product_id, qty, unit_price, cost)
      VALUES (${orderId}, ${product_id}, ${qtyInt}, ${unitPriceNum}, ${snapshotCost})
      RETURNING id
    `;

    return cors(201, {
      ok: true,
      order_no: orderNo,
      order_id: orderId,
      line_id: line[0].id,
      snapshot_cost: snapshotCost
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



