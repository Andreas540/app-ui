// netlify/functions/order.mjs
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
    const {
      customer_id, product_id, qty, unit_price, date, delivered, discount,
      notes,
      product_cost, shipping_cost,
      partner_splits
    } = body || {};

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

    // Convert cost fields to numbers or null
    let productCostNum = null;
    let shippingCostNum = null;
    
    if (product_cost !== undefined && product_cost !== null) {
      const parsed = Number(product_cost);
      if (Number.isFinite(parsed)) {
        productCostNum = parsed;
      }
    }
    
    if (shipping_cost !== undefined && shipping_cost !== null) {
      const parsed = Number(shipping_cost);
      if (Number.isFinite(parsed)) {
        shippingCostNum = parsed;
      }
    }

    // Header
    const hdr = await sql`
      INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, discount, notes, product_cost, shipping_cost)
      VALUES (${TENANT_ID}, ${customer_id}, ${orderNo}, ${date}, ${!!delivered}, ${discount ?? 0}, ${notes || null}, ${productCostNum}, ${shippingCostNum})
      RETURNING id
    `;
    const orderId = hdr[0].id;

    // Line (snapshot product cost)
    await sql`
      INSERT INTO order_items (order_id, product_id, qty, unit_price, cost)
      VALUES (
        ${orderId},
        ${product_id},
        ${qtyInt},
        ${unitPriceNum},
        (SELECT cost FROM products WHERE id = ${product_id} AND tenant_id = ${TENANT_ID})
      )
    `;

    // ⬇️ NEW: Partner splits
    if (Array.isArray(partner_splits) && partner_splits.length) {
      for (const s of partner_splits) {
        const pid = s?.partner_id?.trim?.()
        const amt = Number(s?.amount)
        if (!pid || !Number.isFinite(amt) || amt === 0) continue

        // Ensure partner belongs to tenant
        const exists = await sql`
          SELECT 1 FROM partners
          WHERE id = ${pid} AND tenant_id = ${TENANT_ID}
          LIMIT 1
        `
        if (exists.length === 0) continue

        await sql`
          INSERT INTO order_partners (order_id, partner_id, amount)
          VALUES (${orderId}, ${pid}, ${amt})
        `
      }
    }

    return cors(201, { ok: true, order_no: orderNo, order_id: orderId });
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




