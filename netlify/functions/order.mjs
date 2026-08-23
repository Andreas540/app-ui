// netlify/functions/order.mjs

import { resolveAuthz }        from './utils/auth.mjs'
import { withErrorLogging }    from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('order', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getOrder(event)
  if (event.httpMethod === 'PUT')    return updateOrder(event)
  if (event.httpMethod === 'DELETE') return deleteOrder(event)
  return cors(405, { error: 'Method not allowed' })
})

async function getOrder(event) {
  const { neon } = await import('@neondatabase/serverless')
const { DATABASE_URL } = process.env
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

const id = (event.queryStringParameters?.id || '').trim()
if (!id) return cors(400, { error: 'id required' })

const sql = neon(DATABASE_URL)

const authz = await resolveAuthz({ sql, event })
if (authz.error) return cors(403, { error: authz.error })

const TENANT_ID = authz.tenantId

    // Get order details with cost overrides from orders table
        const orders = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        o.delivered,
        o.delivered_quantity,
        o.delivery_status,
        o.delivered_at,
        o.notes,
        o.customer_id,
        o.product_cost,
        o.shipping_cost,
        c.name AS customer_name,
        c.customer_type
      FROM orders o
JOIN customers c 
  ON c.id = o.customer_id 
 AND c.tenant_id = o.tenant_id
WHERE o.tenant_id = ${TENANT_ID}
  AND o.id = ${id}
LIMIT 1
    `
    
    if (orders.length === 0) return cors(404, { error: 'Order not found' })
    const order = orders[0]

    // Get order items — cost looked up dynamically from product_cost_history as of order date
    const items = await sql`
      SELECT
        oi.id AS order_item_id,
        oi.product_id,
        oi.qty,
        oi.unit_price,
        (
          SELECT ph.cost
          FROM product_cost_history ph
          WHERE ph.tenant_id = ${TENANT_ID}
            AND ph.product_id = oi.product_id
            AND ph.effective_from < ((o.order_date + 1)::timestamp AT TIME ZONE COALESCE(t.default_timezone, 'UTC'))
          ORDER BY ph.effective_from DESC
          LIMIT 1
        ) AS historical_product_cost,
        oi.covers_product_id,
        oi.covers_order_item_id,
        oi.unit_identifier,
        oi.unit_id,
        iu.serial_number AS unit_serial,
        iu.condition     AS unit_condition,
        p.name AS product_name,
        p.product_kind,
        p.coverage_duration_days,
        -- Resolve cross-order coverage: name + unit_id of the referenced order item
        coi_p.name AS covered_product_name,
        coi.unit_identifier AS covered_unit_identifier
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN tenants t ON t.id = o.tenant_id
      LEFT JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id
      LEFT JOIN inventory_units iu ON iu.id = oi.unit_id
      LEFT JOIN order_items coi ON coi.id = oi.covers_order_item_id
      LEFT JOIN products coi_p ON coi_p.id = coi.product_id AND coi_p.tenant_id = o.tenant_id
      WHERE oi.order_id = ${id}
        AND o.tenant_id = ${TENANT_ID}
      ORDER BY oi.created_at ASC NULLS LAST
    `

    if (items.length > 0) {
      Object.assign(order, items[0])
    }

    // Get bookings linked to this order
    const bookings = await sql`
      SELECT
        b.id,
        b.start_at,
        b.end_at,
        b.booking_status,
        b.total_amount,
        b.currency,
        b.notes,
        p.name AS service_name
      FROM bookings b
      LEFT JOIN products p ON p.id = b.service_id AND p.tenant_id = ${TENANT_ID}
      WHERE b.tenant_id = ${TENANT_ID}
        AND (b.order_id = ${id} OR b.id = (SELECT o.booking_id FROM orders o WHERE o.id = ${id} AND o.tenant_id = ${TENANT_ID} LIMIT 1))
      ORDER BY b.start_at ASC
    `

    // Get partner splits for this order
    const partnerSplits = await sql`
  SELECT op.partner_id, c.name AS partner_name, op.amount
  FROM order_partners op
  JOIN orders o ON o.id = op.order_id
  JOIN customers c ON c.id = op.partner_id
  WHERE op.order_id = ${id}
    AND o.tenant_id = ${TENANT_ID}
  ORDER BY op.amount DESC
    `

    // Get historical shipping cost
    const shippingHistory = await sql`
      SELECT shipping_cost
      FROM shipping_cost_history
      WHERE tenant_id = ${TENANT_ID}
        AND customer_id = ${order.customer_id}
        AND effective_from <= ${order.order_date}::date + INTERVAL '1 day'
      ORDER BY effective_from DESC
      LIMIT 1
    `

    const historicalShippingCost = shippingHistory.length > 0 
      ? Number(shippingHistory[0].shipping_cost) 
      : 0

    // Calculate profit across all items
    const orderValue = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0)
    const totalQty    = items.reduce((s, i) => s + Number(i.qty), 0)

    let profit = 0
    let profitPercent = 0

    if (orderValue > 0) {
      // Partner amounts
      const totalPartners = partnerSplits.reduce((sum, split) => sum + Number(split.amount), 0)

      // Product cost: order-level override applies uniformly; otherwise use per-item cost
      const totalProductCost = order.product_cost !== null
        ? Number(order.product_cost) * totalQty
        : items.reduce((s, i) => s + Number(i.qty) * (Number(i.historical_product_cost) || 0), 0)

      const effectiveShippingCost = order.shipping_cost !== null
        ? Number(order.shipping_cost)
        : historicalShippingCost
      const totalShippingCost = effectiveShippingCost * totalQty

      profit = orderValue - totalPartners - totalProductCost - totalShippingCost
      profitPercent = (profit / orderValue) * 100
    }

    const paidRows = await sql`
      SELECT COALESCE(SUM(amount), 0)::numeric AS paid_amount
      FROM payments WHERE order_id = ${id} AND tenant_id = ${TENANT_ID}
    `
    const paidAmount = Number(paidRows[0]?.paid_amount || 0)

    let deliveryEvents = []
    try {
      deliveryEvents = await sql`
        SELECT delivered_quantity, total_qty, delivery_status, event_date::text
        FROM order_delivery_events
        WHERE order_id = ${id}::uuid AND tenant_id = ${TENANT_ID}::uuid
        ORDER BY created_at ASC
      `
    } catch (e) {
      console.error('delivery_events fetch failed', e)
    }

    const orderReturns = await sql`
      SELECT r.id, r.return_date, r.reason, r.reason_notes, r.condition,
             r.settlement_type, r.settlement_amount, r.notes, r.supplier_fault,
             COALESCE(
               json_agg(json_build_object(
                 'product_name', p.name,
                 'qty_returned',  ri.qty_returned,
                 'unit_price',    ri.unit_price
               ) ORDER BY ri.id) FILTER (WHERE ri.id IS NOT NULL),
               '[]'::json
             ) AS items
      FROM returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      LEFT JOIN products p ON p.id = ri.product_id
      WHERE r.order_id = ${id} AND r.tenant_id = ${TENANT_ID}
      GROUP BY r.id
      ORDER BY r.return_date DESC, r.created_at DESC
    `

    return cors(200, {
      order: { ...order, profit, profitPercent, paid_amount: paidAmount, total: orderValue },
      items,
      bookings,
      partner_splits: partnerSplits,
      delivery_events: deliveryEvents,
      returns: orderReturns,
    })
}

async function updateOrder(event) {
  const { neon } = await import('@neondatabase/serverless')
const { DATABASE_URL } = process.env
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })


    const body = JSON.parse(event.body || '{}')
    const {
      id,
      customer_id,
      // items[] is the new multi-item format; product_id/qty/unit_price kept for legacy callers
      items,
      product_id,
      qty,
      unit_price,
      date,
      delivered,
      delivered_at,
      notes,
      product_cost,
      shipping_cost,
      partner_splits,
      item_product_cost,
    } = body

    if (!id) return cors(400, { error: 'id is required' })
    if (!customer_id) return cors(400, { error: 'customer_id is required' })
    if (!date) return cors(400, { error: 'date is required' })

    // Normalise to items array — prefer new format, fall back to legacy single-item
    const itemList = (Array.isArray(items) && items.length > 0)
      ? items
      : (product_id ? [{ product_id, qty, unit_price }] : null)
    if (!itemList) return cors(400, { error: 'product_id or items[] is required' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Validate every item
    for (const item of itemList) {
      if (!item.product_id) return cors(400, { error: 'product_id required for each item' })
      if (!item.qty || item.qty <= 0) return cors(400, { error: 'qty must be > 0' })
      if (typeof item.unit_price !== 'number' || Number.isNaN(item.unit_price)) {
        return cors(400, { error: 'unit_price must be a number' })
      }
      const prods = await sql`
        SELECT name FROM products WHERE id = ${item.product_id} AND tenant_id = ${TENANT_ID} LIMIT 1
      `
      if (!prods.length) return cors(400, { error: `Invalid product_id: ${item.product_id}` })
      const isRefund = (prods[0].name || '').trim().toLowerCase() === 'refund/discount'
      if (isRefund && !(item.unit_price < 0)) return cors(400, { error: 'Refund/Discount requires unit_price < 0' })
      if (!isRefund && !(item.unit_price > 0)) return cors(400, { error: 'unit_price must be > 0' })
    }

    // Update order header
    await sql`
      UPDATE orders
      SET order_date = ${date},
          delivered = ${delivered ?? false},
          delivered_at = ${delivered_at || null},
          notes = ${notes ?? null},
          product_cost = ${product_cost ?? null},
          shipping_cost = ${shipping_cost ?? null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `

    // Replace all order_items
    await sql`DELETE FROM order_items WHERE order_id = ${id}`
    for (const item of itemList) {
      await sql`
        INSERT INTO order_items (order_id, product_id, qty, unit_price, product_cost, covers_product_id, covers_order_item_id, unit_identifier, unit_id)
        VALUES (
          ${id},
          ${item.product_id},
          ${item.qty},
          ${item.unit_price},
          ${typeof item_product_cost === 'number' && !Number.isNaN(item_product_cost) ? item_product_cost : null},
          ${item.covers_product_id ?? null},
          ${item.covers_order_item_id ?? null},
          ${item.unit_identifier?.trim() || null},
          ${item.unit_id ?? null}
        )
      `
    }

    // Update partner splits - delete old ones and insert new ones
    await sql`DELETE FROM order_partners WHERE order_id = ${id}`
    
    if (partner_splits && partner_splits.length > 0) {
      for (const split of partner_splits) {
        await sql`
          INSERT INTO order_partners (order_id, partner_id, amount)
          VALUES (${id}, ${split.partner_id}, ${split.amount})
        `
      }
    }
    // Sync per-line delivered_qty and order-level delivered_quantity with the delivered flag.
    // The DB trigger on order_items.delivered_qty handles warehouse_deliveries updates.
    if (typeof delivered === 'boolean') {
      // Always clear old 'D' rows first — product lineup may have changed during edit
      await sql`
        DELETE FROM warehouse_deliveries
        WHERE order_id = ${id} AND supplier_manual_delivered = 'D'
      `

      if (delivered) {
        // Mark every line as fully delivered — trigger re-creates 'D' rows
        await sql`
          UPDATE order_items SET delivered_qty = qty WHERE order_id = ${id}
        `
      } else {
        // Mark every line as undelivered — trigger removes any 'D' rows
        await sql`
          UPDATE order_items SET delivered_qty = 0 WHERE order_id = ${id}
        `
      }

      const totalRes = await sql`
        SELECT COALESCE(SUM(qty), 0) AS total_qty FROM order_items WHERE order_id = ${id}
      `
      const totalQty = Number(totalRes[0]?.total_qty || 0)
      const newDeliveredQty = delivered ? totalQty : 0

      await sql`
        UPDATE orders
        SET delivered_quantity = ${newDeliveredQty}
        WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      `

    }

    return cors(200, { ok: true })
}

async function deleteOrder(event) {
  const { neon } = await import('@neondatabase/serverless')
const { DATABASE_URL } = process.env
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

const body = JSON.parse(event.body || '{}')
const { id } = body
if (!id) return cors(400, { error: 'id is required' })

const sql = neon(DATABASE_URL)

const authz = await resolveAuthz({ sql, event })
if (authz.error) return cors(403, { error: authz.error })

const TENANT_ID = authz.tenantId

    // Revert any serialized units that were marked Sold by this order back to Listed
    await sql`
      UPDATE inventory_units
      SET listing_status = 'Listed', updated_at = now()
      WHERE tenant_id = ${TENANT_ID}
        AND listing_status = 'Sold'
        AND id IN (
          SELECT unit_id FROM order_items
          WHERE order_id = ${id} AND unit_id IS NOT NULL
        )
    `

    // Delete associated records first
    await sql`DELETE FROM order_items WHERE order_id = ${id}`
    await sql`DELETE FROM order_partners WHERE order_id = ${id}`
    await sql`DELETE FROM message_jobs WHERE booking_id IN (SELECT id FROM bookings WHERE order_id = ${id} AND tenant_id = ${TENANT_ID})`
    await sql`DELETE FROM bookings WHERE order_id = ${id} AND tenant_id = ${TENANT_ID}`

    // Delete order
    await sql`
      DELETE FROM orders
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `

    return cors(200, { ok: true })
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
