// netlify/functions/bootstrap.mjs

import { checkMaintenance } from './utils/maintenance.mjs'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  // 🔴 FIRST LINE - before any other code
  const maintenanceCheck = checkMaintenance()
  if (maintenanceCheck) return maintenanceCheck

  // CORS + preflight
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod !== 'GET')    return cors(405, { error: 'Method not allowed' });

  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    
    console.log('🔵 Bootstrap authz result:', {
      mode: authz.mode,
      role: authz.role,
      tenantId: authz.tenantId,
      error: authz.error
    })

    // SuperAdmin in global mode (no tenant) - return empty bootstrap
    if (authz.role === 'super_admin' && !authz.tenantId) {
      console.log('🟢 SuperAdmin global mode - returning empty bootstrap')
      return cors(200, { 
        customers: [], 
        products: [], 
        partners: [], 
        suppliers: [] 
      });
    }

    // Error handling (after SuperAdmin check)
    if (authz.error) {
      console.log('🔴 Auth error:', authz.error)
      return cors(403, { error: authz.error });
    }

    // Need a tenant to proceed
    if (!authz.tenantId) {
      console.log('🔴 No tenant ID')
      return cors(403, { error: 'No tenant access' });
    }

    const TENANT_ID = authz.tenantId;
    console.log('🟢 Loading bootstrap for tenant:', TENANT_ID)

    // Customers: we need customer_type here (NOT the old 'type')
    const customers = await sql`
      SELECT id, name, customer_type
      FROM customers
      WHERE tenant_id = ${TENANT_ID}
        AND NOT EXISTS (
          SELECT 1 FROM tenant_hidden_customers thc
          WHERE thc.tenant_id = ${TENANT_ID} AND thc.customer_id = id
        )
      ORDER BY name
    `;

    // Products (no unit_price here)
    const products = await sql`
      SELECT id, name, category, price_amount::float8 AS price_amount
      FROM products
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    // Partners come from the dedicated partners table
    const partners = await sql`
      SELECT id, name
      FROM partners
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    // Suppliers come from the dedicated suppliers table
    const suppliers = await sql`
      SELECT id, name
      FROM suppliers
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    console.log('🟢 Bootstrap loaded:', {
      customers: customers.length,
      products: products.length,
      partners: partners.length,
      suppliers: suppliers.length
    })

    return cors(200, { customers, products, partners, suppliers });
  } catch (e) {
    console.error('🔴 Bootstrap error:', e);    
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  };
}


