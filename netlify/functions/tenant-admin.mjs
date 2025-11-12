// netlify/functions/tenant-admin.mjs

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'GET')    return handleGet(event)
  if (event.httpMethod === 'POST')   return handlePost(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleGet(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const { action, tenantId } = event.queryStringParameters || {}

    // Get all tenants (excluding BLV)
    if (action === 'getTenants') {
      const tenants = await sql`
        SELECT id, name, created_at 
        FROM tenants 
        WHERE name != 'BLV'
        ORDER BY name
      `
      return cors(200, { tenants })
    }

    // Get config for a specific tenant
    if (action === 'getConfig' && tenantId) {
      const rows = await sql`
        SELECT config_key, config_value
        FROM tenant_config
        WHERE tenant_id = ${tenantId}
      `

      // Transform rows into a config object
      const config = {}
      rows.forEach(row => {
        config[row.config_key] = row.config_value
      })

      return cors(200, { config })
    }

    return cors(400, { error: 'Invalid action or missing parameters' })
  } catch (e) {
    console.error('handleGet error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function handlePost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const body = JSON.parse(event.body || '{}')
    const { action, tenantId, config } = body

    // Update tenant configuration
    if (action === 'updateConfig' && tenantId && config) {
      // Update each config key
      for (const [configKey, configValue] of Object.entries(config)) {
        await sql`
          INSERT INTO tenant_config (tenant_id, config_key, config_value)
          VALUES (${tenantId}, ${configKey}, ${JSON.stringify(configValue)})
          ON CONFLICT (tenant_id, config_key) 
          DO UPDATE SET 
            config_value = ${JSON.stringify(configValue)},
            updated_at = NOW()
        `
      }

      return cors(200, { 
        success: true, 
        message: 'Configuration updated successfully' 
      })
    }

    return cors(400, { error: 'Invalid action or missing parameters' })
  } catch (e) {
    console.error('handlePost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  }
}
