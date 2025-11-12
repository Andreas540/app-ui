import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, tenantId } = event.queryStringParameters || {};
    
    // GET requests
    if (event.httpMethod === 'GET') {
      
      // Get all tenants (excluding BLV)
      if (action === 'getTenants') {
        const result = await pool.query(`
          SELECT id, name, created_at 
          FROM tenants 
          WHERE name != 'BLV'
          ORDER BY name
        `);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ tenants: result.rows })
        };
      }

      // Get config for a specific tenant
      if (action === 'getConfig' && tenantId) {
        const result = await pool.query(`
          SELECT config_key, config_value
          FROM tenant_config
          WHERE tenant_id = $1
        `, [tenantId]);

        // Transform rows into a config object
        const config = {};
        result.rows.forEach(row => {
          config[row.config_key] = row.config_value;
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ config })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid action or missing parameters' })
      };
    }

    // POST requests
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, tenantId, config } = body;

      // Update tenant configuration
      if (action === 'updateConfig' && tenantId && config) {
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');

          // Update each config key
          for (const [configKey, configValue] of Object.entries(config)) {
            await client.query(`
              INSERT INTO tenant_config (tenant_id, config_key, config_value)
              VALUES ($1, $2, $3)
              ON CONFLICT (tenant_id, config_key) 
              DO UPDATE SET 
                config_value = $3,
                updated_at = NOW()
            `, [tenantId, configKey, JSON.stringify(configValue)]);
          }

          await client.query('COMMIT');

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true, 
              message: 'Configuration updated successfully' 
            })
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid action or missing parameters' })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Error in tenant-admin function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
