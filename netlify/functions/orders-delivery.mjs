// netlify/functions/orders-delivery.mjs
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'PUT') return updateDeliveryStatus(event);
  return cors(405, { error: 'Method not allowed' });
}

async function updateDeliveryStatus(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const { order_id, delivered_at } = body || {};
    const deliveredQuantityRaw = body.delivered_quantity;
    const deliveredFlag = body.delivered; // legacy support

    if (!order_id || typeof order_id !== 'string') {
      return cors(400, { error: 'order_id is required' });
    }

    if (deliveredQuantityRaw === undefined && typeof deliveredFlag !== 'boolean') {
      return cors(400, {
        error: 'Either delivered_quantity (number) or delivered (boolean) is required',
      });
    }

    const sql = neon(DATABASE_URL);

    // Ensure delivered_at column exists (safe to run repeatedly)
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at DATE`;

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    // Get total ordered quantity for this order
    const totals = await sql`
      SELECT COALESCE(SUM(oi.qty), 0) AS total_qty
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.id = ${order_id}
    `;

    if (totals.length === 0) {
      return cors(404, { error: 'Order not found' });
    }

    const totalQty = Number(totals[0].total_qty || 0);

    let newDeliveredQty;
    let newDeliveredFlag;

    if (deliveredQuantityRaw !== undefined && deliveredQuantityRaw !== null && deliveredQuantityRaw !== '') {
      // Tri-state path: explicit delivered_quantity from UI
      const n = Number(deliveredQuantityRaw);
      if (!Number.isFinite(n)) {
        return cors(400, { error: 'delivered_quantity must be a number' });
      }
      // Clamp between 0 and totalQty
      newDeliveredQty = Math.max(0, Math.min(n, totalQty));
      newDeliveredFlag = (newDeliveredQty === totalQty);
    } else {
      // Legacy path: boolean delivered flag
      if (typeof deliveredFlag !== 'boolean') {
        return cors(400, { error: 'delivered must be true or false' });
      }
      newDeliveredFlag = deliveredFlag;
      newDeliveredQty = deliveredFlag ? totalQty : 0;
    }

    // delivered_at: use provided date if marking delivered, clear if undelivering
    const newDeliveredAt = newDeliveredQty > 0
      ? (delivered_at || new Date().toISOString().slice(0, 10))
      : null

    const result = await sql`
      UPDATE orders
      SET delivered_quantity = ${newDeliveredQty},
          delivered          = ${newDeliveredFlag},
          delivered_at       = ${newDeliveredAt}
      WHERE tenant_id = ${TENANT_ID}
        AND id = ${order_id}
      RETURNING
        id,
        delivered,
        delivered_quantity,
        delivery_status,
        delivered_at
    `;

    if (result.length === 0) {
      return cors(404, { error: 'Order not found' });
    }

    const row = result[0];

    return cors(200, {
      ok: true,
      order_id:          row.id,
      delivered:         row.delivered,
      delivered_quantity: row.delivered_quantity,
      delivery_status:   row.delivery_status,
      delivered_at:      row.delivered_at,
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}
