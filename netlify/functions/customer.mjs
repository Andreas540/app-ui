// netlify/functions/customer.mjs

import { resolveAuthz } from './utils/auth.mjs'

// ---------------------------------------------------------------------------
// Helper: both 'BLV' (legacy) and 'Direct' (all other tenants) are "direct"
// customer types — same business logic, different stored label.
// Use this helper everywhere you need to branch on direct vs partner behavior.
// ---------------------------------------------------------------------------
export function isDirectType(customer_type) {
  return customer_type === 'BLV' || customer_type === 'Direct'
}

const VALID_CUSTOMER_TYPES = ['BLV', 'Direct', 'Partner']

import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('customer', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getCustomer(event)
  if (event.httpMethod === 'PUT')    return updateCustomer(event)
  return cors(405, { error: 'Method not allowed' })
})

async function getCustomer(event) {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const id = (event.queryStringParameters?.id || '').trim()
    if (!id) return cors(400, { error: 'id required' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at DATE`

    const cust = await sql`
      SELECT id, name, customer_type, shipping_cost, company_name, phone, email,
             address1, address2, city, state, postal_code, country, sms_consent
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
        o.delivered_quantity,
        o.delivered_at,
        o.delivery_status,
        o.notes,
        COALESCE(SUM(oi.qty * oi.unit_price),0)::numeric(12,2) AS total,
        COALESCE(SUM(oi.qty),0)::integer AS total_qty,
        COALESCE(
          json_agg(
            json_build_object('product_name', p.name, 'qty', oi.qty, 'unit_price', oi.unit_price)
            ORDER BY oi.id ASC
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items,
        pa.partner_amount
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(op.amount),0)::numeric(12,2) AS partner_amount
        FROM order_partners op
        WHERE op.order_id = o.id
      ) pa ON true
      WHERE o.tenant_id = ${TENANT_ID}
        AND o.customer_id = ${id}
      GROUP BY
        o.id,
        o.order_no,
        o.order_date,
        o.delivered,
        o.delivered_quantity,
        o.delivered_at,
        o.delivery_status,
        o.notes,
        pa.partner_amount
      ORDER BY o.order_date DESC, o.order_no DESC
      LIMIT 100
    `

    const payments = await sql`
      SELECT p.id, p.payment_date, p.payment_type, p.amount, p.notes, p.created_at,
             p.order_id, o.order_no
      FROM payments p
      LEFT JOIN orders o ON o.id = p.order_id AND o.tenant_id = ${TENANT_ID}
      WHERE p.tenant_id = ${TENANT_ID} AND p.customer_id = ${id}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT 100
    `

    return cors(200, { customer, totals: totals[0], orders, payments })
}

async function updateCustomer(event) {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const body = JSON.parse(event.body || '{}')
    const {
      id, name, customer_type, shipping_cost, apply_to_history, effective_date, company_name,
      phone, email, sms_consent, address1, address2, city, state, postal_code, country
    } = body || {}

    if (!id)   return cors(400, { error: 'id is required' })
    if (!name || typeof name !== 'string') return cors(400, { error: 'name is required' })
    if (customer_type && !VALID_CUSTOMER_TYPES.includes(customer_type)) {
      return cors(400, { error: `invalid customer_type — must be one of: ${VALID_CUSTOMER_TYPES.join(', ')}` })
    }
    const sc = (shipping_cost === null || shipping_cost === undefined)
      ? null
      : Number(shipping_cost)
    if (shipping_cost !== undefined && shipping_cost !== null && !Number.isFinite(sc)) {
      return cors(400, { error: 'shipping_cost must be a number or null' })
    }

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    // Get current shipping cost to check if it changed
    const current = await sql`
      SELECT shipping_cost
      FROM customers
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `
    if (current.length === 0) return cors(404, { error: 'Customer not found' })

    const currentShippingCost = current[0].shipping_cost
    const shippingCostChanged = sc !== currentShippingCost

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
        email = ${email ?? null},
        sms_consent = COALESCE(${sms_consent ?? null}::boolean, sms_consent),
        sms_consent_at = CASE WHEN ${sms_consent ?? null}::boolean IS TRUE AND NOT sms_consent THEN now() ELSE sms_consent_at END,
        address1 = ${address1 ?? null},
        address2 = ${address2 ?? null},
        city = ${city ?? null},
        state = ${state ?? null},
        postal_code = ${postal_code ?? null},
        country = ${country ?? null}
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
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}










