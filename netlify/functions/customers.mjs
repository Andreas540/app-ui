// netlify/functions/customers.mjs
import { checkMaintenance } from './utils/maintenance.mjs'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  // 🔴 FIRST LINE - before any other code
  const maintenanceCheck = checkMaintenance()
  if (maintenanceCheck) return maintenanceCheck

  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')     return listCustomers(event);
  if (event.httpMethod === 'POST')    return createCustomer(event);
  return cors(405, { error: 'Method not allowed' });
}

async function listCustomers(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

const authz = await resolveAuthz({ sql, event });
if (authz.error) {
  return cors(403, { error: authz.error });
}

const tenantId = authz.tenantId;

console.log('Loading customers for tenant:', tenantId);

    const q = (event.queryStringParameters?.q || '').trim();
    const like = q ? `%${q.toLowerCase()}%` : null;

    // Get customer list with their order/payment totals
    const rows = await sql`
      SELECT
        c.id,
        c.name,
        c.customer_type,
        COALESCE(t.total_orders, 0)::numeric(12,2)   AS total_orders,
        COALESCE(t.total_payments, 0)::numeric(12,2) AS total_payments,
        (COALESCE(t.total_orders, 0) - COALESCE(t.total_payments, 0))::numeric(12,2) AS owed_to_me
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT
          (SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
            WHERE o.tenant_id = ${tenantId}
              AND o.customer_id = c.id) AS total_orders,
          (SELECT COALESCE(SUM(p.amount), 0)
             FROM payments p
            WHERE p.tenant_id = ${tenantId}
              AND p.customer_id = c.id) AS total_payments
      ) t ON TRUE
      WHERE c.tenant_id = ${tenantId}
        ${like ? sql`AND LOWER(c.name) LIKE ${like}` : sql``}
      ORDER BY c.name
    `;

    // Calculate global partner totals (not per-customer)
    const partnerTotals = await sql`
      SELECT
        (SELECT COALESCE(SUM(op.amount), 0)
           FROM order_partners op
           JOIN orders o ON o.id = op.order_id
          WHERE o.tenant_id = ${tenantId}) AS total_owed_to_partners,
        (SELECT COALESCE(SUM(pp.amount), 0)
           FROM partner_payments pp
          WHERE pp.tenant_id = ${tenantId}) AS total_partner_payments
    `;

    const owedToPartners = Number(partnerTotals[0].total_owed_to_partners);
    const paidToPartners = Number(partnerTotals[0].total_partner_payments);

    return cors(200, { 
      customers: rows,
      partner_totals: {
        owed: owedToPartners,
        paid: paidToPartners,
        net: owedToPartners - paidToPartners
      }
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function createCustomer(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

const authz = await resolveAuthz({ sql, event });
if (authz.error) {
  return cors(403, { error: authz.error });
}

const tenantId = authz.tenantId;

console.log('Creating customer for tenant:', tenantId);

    const body = JSON.parse(event.body || '{}');

    const {
      name,
      customer_type,
      shipping_cost,
      company_name,
      phone,
      address1,
      address2,
      city,
      state,
      postal_code,
    } = body || {};

    if (!name || typeof name !== 'string') {
      return cors(400, { error: 'name is required' });
    }
    if (!['BLV', 'Partner'].includes(customer_type)) {
      return cors(400, { error: 'customer_type must be BLV or Partner' });
    }

    let ship = null;
    if (shipping_cost !== undefined && shipping_cost !== null) {
      const n = Number(shipping_cost);
      if (!Number.isFinite(n) || n < 0) {
        return cors(400, { error: 'shipping_cost must be a non-negative number (or omitted)' });
      }
      ship = n;
    }

    const ins = await sql`
      INSERT INTO customers (
        tenant_id, name, customer_type, shipping_cost, company_name,
        phone, address1, address2, city, state, postal_code
      ) VALUES (
        ${tenantId}, ${name.trim()}, ${customer_type}, ${ship}, ${company_name ?? null},
        ${phone ?? null}, ${address1 ?? null}, ${address2 ?? null},
        ${city ?? null}, ${state ?? null}, ${postal_code ?? null}
      )
      RETURNING id
    `;

    const customerId = ins[0].id;

    // Seed shipping cost history at "now" (matching product.mjs pattern)
    if (ship !== null) {
      await sql`
        INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from)
        VALUES (${tenantId}, ${customerId}, ${ship}, NOW())
      `;
    }

    return cors(200, { ok: true, id: customerId });
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
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}



