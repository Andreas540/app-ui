// Create this new file: netlify/functions/orders-delivery.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'PUT') return updateDeliveryStatus(event);
  return cors(405, { error: 'Method not allowed' });
}

async function updateDeliveryStatus(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const { order_id, delivered } = body || {};

    if (!order_id || typeof order_id !== 'string') {
      return cors(400, { error: 'order_id is required' });
    }
    if (typeof delivered !== 'boolean') {
      return cors(400, { error: 'delivered must be true or false' });
    }

    const sql = neon(DATABASE_URL);

    const result = await sql`
      UPDATE orders 
      SET delivered = ${delivered}
      WHERE tenant_id = ${TENANT_ID} 
        AND id = ${order_id}
      RETURNING id, delivered
    `;

    if (result.length === 0) {
      return cors(404, { error: 'Order not found' });
    }

    return cors(200, { 
      ok: true, 
      order_id: result[0].id,
      delivered: result[0].delivered 
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
      'access-control-allow-methods': 'PUT,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}