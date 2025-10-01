// netlify/functions/order.mjs
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
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const id = (event.queryStringParameters?.id || '').trim()
    if (!id) return cors(400, { error: 'id required' })

    const sql = neon(DATABASE_URL)

    // Get order details with cost overrides from orders table
    const orders = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        o.delivered,
        o.notes,
        o.customer_id,
        o.product_cost,
        o.shipping_cost,
        c.name AS customer_name,
        c.customer_type
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.tenant_id = ${TENANT_ID} AND o.id = ${id}
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
        p.name AS product_name
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ${id}
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

    return cors(200, { order, partner_splits: partnerSplits })
  } catch (e) {
    console.error('getOrder error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function updateOrder(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

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
    } = body

    if (!id) return cors(400, { error: 'id is required' })
    if (!customer_id) return cors(400, { error: 'customer_id is required' })
    if (!product_id) return cors(400, { error: 'product_id is required' })
    if (!qty || qty <= 0) return cors(400, { error: 'qty must be > 0' })
    if (!unit_price || unit_price <= 0) return cors(400, { error: 'unit_price must be > 0' })
    if (!date) return cors(400, { error: 'date is required' })

    const sql = neon(DATABASE_URL)

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