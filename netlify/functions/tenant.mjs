// Create this file: netlify/functions/tenant.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET') return getTenant(event);
  return cors(405, { error: 'Method not allowed' });
}

async function getTenant(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID) return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);

    // Query the tenants table (plural)
    try {
      const tenant = await sql`
        SELECT id, name 
        FROM tenants 
        WHERE id = ${TENANT_ID}
        LIMIT 1
      `;
      
      if (tenant.length > 0) {
        return cors(200, { 
          tenant: {
            id: tenant[0].id,
            name: tenant[0].name || 'BLV'
          }
        });
      }
    } catch (tableError) {
      // If tenants table doesn't exist, fall back to default
      console.log('Tenants table not found, using default name');
    }

    // Fallback: return TENANT_ID as both id and name
    return cors(200, { 
      tenant: {
        id: TENANT_ID,
        name: 'BLV' // Default name since we know this is BLV
      }
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
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}