// netlify/functions/bootstrap.mjs

import { checkMaintenance } from './utils/maintenance.mjs'
import { resolveAuthz } from './utils/auth.mjs'
import { logActivity } from './utils/activity-logger.mjs'  // 🆕 NEW - Add this import

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
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    // Customers: we need customer_type here (NOT the old 'type')
    const customers = await sql`
      SELECT id, name, customer_type
      FROM customers
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;

    // Products (no unit_price here)
    const products = await sql`
      SELECT id, name
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

    // 🆕 NEW - Log successful activity
    await logActivity({ 
      sql, 
      event, 
      action: 'view_bootstrap',
      success: true 
    })

    return cors(200, { customers, products, partners, suppliers });
  } catch (e) {
    console.error(e);
    
    // 🆕 NEW - Log error activity
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      await logActivity({ 
        sql, 
        event, 
        action: 'view_bootstrap',
        success: false,
        error: String(e?.message || e)
      })
    } catch (logErr) {
      console.error('Logging failed:', logErr)
    }
    
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}


