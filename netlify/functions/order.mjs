// netlify/functions/order.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getOrder(event)
  if (event.httpMethod === 'PUT')    return updateOrder(event)
  if (event.httpMethod === 'DELETE') return deleteOrder(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getOrder(event) {
  try {
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

    // Get order items
    const items = await sql`
      SELECT
        oi.product_id,
        oi.qty,
        oi.unit_price,
        oi.cost as historical_product_cost,
        p.name AS product_name
      FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id
WHERE oi.order_id = ${id}
  AND o.tenant_id = ${TENANT_ID}
      LIMIT 1
    `

    if (items.length > 0) {
      Object.assign(order, items[0])
    }

    // Get partner splits for this order
    const partnerSplits = await sql`
      SELECT partner_id, amount
      FROM order_partners
      WHERE order_id = ${id}
      ORDER BY amount DESC
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

    // Calculate profit (only for positive order values)
    const qty = Number(order.qty) || 0
    const unitPrice = Number(order.unit_price) || 0
    const orderValue = qty * unitPrice

    let profit = 0
    let profitPercent = 0

    if (orderValue > 0) {
      // Partner amounts
      const totalPartners = partnerSplits.reduce((sum, split) => sum + Number(split.amount), 0)

      // Effective costs
      const effectiveProductCost = order.product_cost !== null 
        ? Number(order.product_cost) 
        : (Number(order.historical_product_cost) || 0)

      const effectiveShippingCost = order.shipping_cost !== null 
        ? Number(order.shipping_cost) 
        : historicalShippingCost

      const totalProductCost = effectiveProductCost * qty
      const totalShippingCost = effectiveShippingCost * qty

      profit = orderValue - totalPartners - totalProductCost - totalShippingCost
      profitPercent = (profit / orderValue) * 100
    }

    return cors(200, { 
      order: {
        ...order,
        profit,
        profitPercent
      }, 
      partner_splits: partnerSplits 
    })
  } catch (e) {
    console.error('getOrder error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function updateOrder(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
const { DATABASE_URL } = process.env
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })


    const body = JSON.parse(event.body || '{}')
    const {
      id,
      customer_id,
      product_id,
      qty,
      unit_price,
      date,
      delivered,
      notes,
      product_cost,
      shipping_cost,
      partner_splits,
      item_product_cost,
    } = body

    if (!id) return cors(400, { error: 'id is required' })
    if (!customer_id) return cors(400, { error: 'customer_id is required' })
    if (!product_id) return cors(400, { error: 'product_id is required' })
    if (!qty || qty <= 0) return cors(400, { error: 'qty must be > 0' })
    if (!date) return cors(400, { error: 'date is required' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
if (authz.error) return cors(403, { error: authz.error })

const TENANT_ID = authz.tenantId

    // Look up product name to decide if negative price is allowed
    const products = await sql`
  SELECT name
  FROM products
  WHERE id = ${product_id} AND tenant_id = ${TENANT_ID}
  LIMIT 1
    `
    if (products.length === 0) return cors(400, { error: 'Invalid product_id' })

    const productName = (products[0].name || '').trim().toLowerCase()
    const isRefundProduct = productName === 'refund/discount'

    // Validate unit_price according to product type
    if (typeof unit_price !== 'number' || Number.isNaN(unit_price)) {
      return cors(400, { error: 'unit_price must be a number' })
    }
    if (isRefundProduct) {
      if (!(unit_price < 0)) return cors(400, { error: 'Refund/Discount requires unit_price < 0' })
    } else {
      if (!(unit_price > 0)) return cors(400, { error: 'unit_price must be > 0' })
    }

    // Update order with cost overrides
    await sql`
      UPDATE orders
      SET order_date = ${date},
          delivered = ${delivered ?? false},
          notes = ${notes ?? null},
          product_cost = ${product_cost ?? null},
          shipping_cost = ${shipping_cost ?? null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `

    // Update order_items
    await sql`
      UPDATE order_items
      SET product_id = ${product_id},
          qty = ${qty},
          unit_price = ${unit_price}
      WHERE order_id = ${id}
    `
    // If we have a per-item product cost (override or from history),
    // persist it to order_items.product_cost only.
    if (typeof item_product_cost === 'number' && !Number.isNaN(item_product_cost)) {
      await sql`
        UPDATE order_items
        SET product_cost = ${item_product_cost}
        WHERE order_id = ${id}
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
    // 🔄 Keep delivered_quantity in sync with delivered flag
if (typeof delivered === 'boolean') {
  // Recompute total quantity from order_items
  const totalRes = await sql`
    SELECT COALESCE(SUM(qty), 0) AS total_qty
    FROM order_items
    WHERE order_id = ${id}
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
  } catch (e) {
    console.error('updateOrder error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteOrder(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const body = JSON.parse(event.body || '{}')
    const { id } = body

    if (!id) return cors(400, { error: 'id is required' })

    const sql = neon(DATABASE_URL)

    // Delete associated records first
    await sql`DELETE FROM order_items WHERE order_id = ${id}`
    await sql`DELETE FROM order_partners WHERE order_id = ${id}`
    
    // Delete order
    await sql`
      DELETE FROM orders
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `

    return cors(200, { ok: true })
  } catch (e) {
    console.error('deleteOrder error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
