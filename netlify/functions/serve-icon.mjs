// netlify/functions/serve-icon.mjs
export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    
    if (!DATABASE_URL) {
      return {
        statusCode: 500,
        body: 'DATABASE_URL not configured'
      }
    }

    const sql = neon(DATABASE_URL)
    
    // Get parameters
    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')
    const iconType = params.get('type') || '192' // Default to 192
    
    if (!tenantId) {
      return {
        statusCode: 400,
        body: 'tenant_id required'
      }
    }

    // Get icon from database
    const column = iconType === 'favicon' ? 'favicon' : `app_icon_${iconType}`
    const result = await sql`
      SELECT ${sql(column)} as icon_data
      FROM tenants
      WHERE id = ${tenantId}
      LIMIT 1
    `
    
    if (result.length === 0 || !result[0].icon_data) {
      return {
        statusCode: 404,
        body: 'Icon not found'
      }
    }

    // Extract base64 data (remove data:image/png;base64, prefix if present)
    const base64Data = result[0].icon_data.split(',')[1] || result[0].icon_data

    // Return image
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      },
      body: base64Data,
      isBase64Encoded: true
    }
  } catch (e) {
    console.error('Serve icon error:', e)
    return {
      statusCode: 500,
      body: String(e?.message || e)
    }
  }
}