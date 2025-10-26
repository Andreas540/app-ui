// netlify/functions/customer.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getCustomer(event)
  if (event.httpMethod === 'PUT')    return updateCustomer(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCustomer(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const id = (event.queryStringParameters?.id || '').trim()
    if (!id) return cors(400, { error: 'id required' })

    const sql = neon(DATABASE_URL)

    const cust = await sql`
      SELECT id, name, customer_type, shipping_cost, company_name, phone,
             address1, address2, city, state, postal_code
      FROM customers
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `
    if (cust.length === 0) return cors(404, { error: 'Not found' })
    const customer = cust[0]

    const totals = await sql`
      WITH o AS (
        SELECT SUM(oi.qty * oi.unit_price)::numeric(12,2) AS total_orders
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.tenant_id = ${TENANT_ID} AND o.customer_id = ${id}
      ),
      p AS (
        SELECT SUM(amount)::numeric(12,2) AS total_payments
        FROM payments
        WHERE tenant_id = ${TENANT_ID} AND customer_id = ${id}
      )
      SELECT COALESCE(o.total_orders,0) AS total_orders,
             COALESCE(p.total_payments,0) AS total_payments,
             (COALESCE(o.total_orders,0) - COALESCE(p.total_payments,0)) AS owed_to_me
      FROM o, p
    `

    const orders = await sql`
      SELECT
        o.id,
        o.order_no,
        o.order_date,
        o.delivered,
        o.notes,
        COALESCE(SUM(oi.qty * oi.unit_price),0)::numeric(12,2) AS total,
        COUNT(oi.id) AS lines,
        fl.product_name,
        fl.qty,
        fl.unit_price,
        pa.partner_amount
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT p.name AS product_name, oi2.qty, oi2.unit_price
        FROM order_items oi2
        JOIN products p ON p.id = oi2.product_id
        WHERE oi2.order_id = o.id
        ORDER BY oi2.id ASC
        LIMIT 1
      ) fl ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(op.amount),0)::numeric(12,2) AS partner_amount
        FROM order_partners op
        WHERE op.order_id = o.id
      ) pa ON true
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.customer_id = ${id}
      GROUP BY o.id, fl.product_name, fl.qty, fl.unit_price, pa.partner_amount
      ORDER BY o.order_date DESC, o.order_no DESC
      LIMIT 30
    `

    const payments = await sql`
      SELECT id, payment_date, payment_type, amount, notes, created_at
      FROM payments
      WHERE tenant_id = ${TENANT_ID} AND customer_id = ${id}
      ORDER BY payment_date DESC, created_at DESC
      LIMIT 30
    `

    return cors(200, { customer, totals: totals[0], orders, payments })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function updateCustomer(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const body = JSON.parse(event.body || '{}')
    const {
      id, name, customer_type, shipping_cost, apply_to_history, effective_date, company_name,
      phone, address1, address2, city, state, postal_code
    } = body || {}

    if (!id)   return cors(400, { error: 'id is required' })
    if (!name || typeof name !== 'string') return cors(400, { error: 'name is required' })
    if (customer_type && !['BLV','Partner'].includes(customer_type)) {
      return cors(400, { error: 'invalid customer_type' })
    }
    const sc = (shipping_cost === null || shipping_cost === undefined)
      ? null
      : Number(shipping_cost)
    if (shipping_cost !== undefined && shipping_cost !== null && !Number.isFinite(sc)) {
      return cors(400, { error: 'shipping_cost must be a number or null' })
    }

    const sql = neon(DATABASE_URL)

    // Get current shipping cost to check if it changed
    const current = await sql`
      SELECT shipping_cost
      FROM customers
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `
    if (current.length === 0) return cors(404, { error: 'Customer not found' })

    const currentShippingCost = current[0].shipping_cost
    const shippingCostChanged = sc !== null && sc !== currentShippingCost

    // Determine if we should update customers.shipping_cost immediately
    let shouldUpdateShippingCostNow = false;
    
    if (shippingCostChanged) {
      if (apply_to_history) {
        // Applying to all history = effective immediately
        shouldUpdateShippingCostNow = true;
      } else if (effective_date) {
        // Check if effective date is today or in the past
        const effectiveDateObj = new Date(effective_date + 'T00:00:00Z');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        shouldUpdateShippingCostNow = effectiveDateObj <= today;
      } else {
        // No specific date = from next order = effective now
        shouldUpdateShippingCostNow = true;
      }
    }

    // Update customer record
    const res = await sql`
      UPDATE customers SET
        name = ${name},
        customer_type = ${customer_type ?? null},
        shipping_cost = CASE 
          WHEN ${shouldUpdateShippingCostNow} THEN ${sc}
          ELSE shipping_cost
        END,
        company_name = ${company_name ?? null},
        phone = ${phone ?? null},
        address1 = ${address1 ?? null},
        address2 = ${address2 ?? null},
        city = ${city ?? null},
        state = ${state ?? null},
        postal_code = ${postal_code ?? null}
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      RETURNING id
    `
    if (res.length === 0) return cors(404, { error: 'Not found' })

    // Handle shipping cost history if cost changed
    if (shippingCostChanged) {
      if (apply_to_history) {
        // Delete all previous history entries for this customer
        await sql`
          DELETE FROM shipping_cost_history
          WHERE tenant_id = ${TENANT_ID} AND customer_id = ${id}
        `
        // Insert single entry backdated to beginning - applies to all orders
        await sql`
          INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from)
          VALUES (${TENANT_ID}, ${id}, ${sc}, '1970-01-01')
        `
      } else if (effective_date) {
        // Insert entry with specific date
        await sql`
          INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from)
          VALUES (${TENANT_ID}, ${id}, ${sc}, ${effective_date})
        `
      } else {
        // Normal case: add new entry with current timestamp
        await sql`
          INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from)
          VALUES (${TENANT_ID}, ${id}, ${sc}, NOW())
        `
      }
    }

    return cors(200, { 
      ok: true,
      applied_to_history: apply_to_history && shippingCostChanged
    })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}










