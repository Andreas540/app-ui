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

    if (!order_id || typeof order_id !== 'string') {
      return cors(400, { error: 'order_id is required' });
    }

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    // Fetch all order items for this order (need id, product_id, qty)
    const orderItems = await sql`
      SELECT oi.id, oi.product_id, oi.qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.order_id = ${order_id}
        AND o.tenant_id = ${TENANT_ID}
    `;

    if (orderItems.length === 0) {
      return cors(404, { error: 'Order not found or has no items' });
    }

    // Build per-line delivered_qty values from whichever format the caller used.
    //
    // Format A (new, from DeliveryModal): { lines: [{ order_item_id, delivered_qty }] }
    // Format B (boolean toggle, from Dashboard): { delivered: true/false }
    // Format C (legacy quantity, kept for safety): { delivered_quantity: number }
    let lineUpdates; // [{ id, delivered_qty }]

    if (Array.isArray(body.lines) && body.lines.length > 0) {
      // Format A — validate each line
      const itemById = Object.fromEntries(orderItems.map(i => [i.id, i]));
      lineUpdates = [];
      for (const line of body.lines) {
        const item = itemById[line.order_item_id];
        if (!item) return cors(400, { error: `Unknown order_item_id: ${line.order_item_id}` });
        const dqty = Number(line.delivered_qty);
        if (!Number.isFinite(dqty)) return cors(400, { error: 'delivered_qty must be a number' });
        lineUpdates.push({ id: item.id, delivered_qty: Math.max(0, Math.min(dqty, Number(item.qty))) });
      }
    } else if (typeof body.delivered === 'boolean') {
      // Format B — all lines fully delivered or all zero
      lineUpdates = orderItems.map(item => ({
        id: item.id,
        delivered_qty: body.delivered ? Number(item.qty) : 0,
      }));
    } else if (body.delivered_quantity !== undefined && body.delivered_quantity !== null && body.delivered_quantity !== '') {
      // Format C — legacy: single number applied to first (and typically only) line
      const totalQty = orderItems.reduce((s, i) => s + Number(i.qty), 0);
      const n = Math.max(0, Math.min(Number(body.delivered_quantity), totalQty));
      if (!Number.isFinite(n)) return cors(400, { error: 'delivered_quantity must be a number' });
      // Distribute proportionally across lines (for single-line orders this is exact)
      let remaining = n;
      lineUpdates = orderItems.map((item, idx) => {
        if (idx === orderItems.length - 1) {
          return { id: item.id, delivered_qty: remaining };
        }
        const share = Math.min(Number(item.qty), remaining);
        remaining -= share;
        return { id: item.id, delivered_qty: share };
      });
    } else {
      return cors(400, { error: 'Provide lines[], delivered (boolean), or delivered_quantity' });
    }

    // Apply per-line updates — the DB trigger fires and adjusts warehouse_deliveries
    for (const line of lineUpdates) {
      await sql`
        UPDATE order_items
        SET delivered_qty = ${line.delivered_qty}
        WHERE id = ${line.id}
      `;
    }

    // Recompute order-level delivered / delivered_quantity for backward compat
    const totalQty    = orderItems.reduce((s, i) => s + Number(i.qty), 0);
    const totalDelivered = lineUpdates.reduce((s, l) => s + l.delivered_qty, 0);
    const newDeliveredFlag = totalDelivered >= totalQty && totalQty > 0;
    const newDeliveredAt = totalDelivered > 0
      ? (delivered_at || new Date().toISOString().slice(0, 10))
      : null;

    const result = await sql`
      UPDATE orders
      SET delivered          = ${newDeliveredFlag},
          delivered_quantity = ${totalDelivered},
          delivered_at       = ${newDeliveredAt}
      WHERE tenant_id = ${TENANT_ID}
        AND id = ${order_id}
      RETURNING id, delivered, delivered_quantity, delivery_status, delivered_at
    `;

    if (result.length === 0) {
      return cors(404, { error: 'Order not found' });
    }

    const eventStatus = totalDelivered === 0 ? 'not_delivered'
      : totalDelivered >= totalQty ? 'delivered'
      : 'partial'
    const eventDate = newDeliveredAt || new Date().toISOString().slice(0, 10)
    await sql`
      INSERT INTO order_delivery_events
        (tenant_id, order_id, delivered_quantity, total_qty, delivery_status, event_date)
      VALUES
        (${TENANT_ID}::uuid, ${order_id}::uuid, ${totalDelivered}, ${totalQty}, ${eventStatus}, ${eventDate}::date)
    `

    const row = result[0];
    return cors(200, {
      ok: true,
      order_id:           row.id,
      delivered:          row.delivered,
      delivered_quantity: row.delivered_quantity,
      delivery_status:    row.delivery_status,
      delivered_at:       row.delivered_at,
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
