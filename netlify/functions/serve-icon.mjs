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
    
    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')
    const iconType = params.get('type') || '192'
    
    if (!tenantId) {
      return {
        statusCode: 400,
        body: 'tenant_id required'
      }
    }
    
    // Handle app name request (for dynamic page title)
    if (iconType === 'name') {
      const result = await sql`
        SELECT name, app_name 
        FROM tenants 
        WHERE id = ${tenantId} 
        LIMIT 1
      `
      
      if (result.length === 0) {
        return { 
          statusCode: 404, 
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ app_name: 'Soltiva' }) 
        }
      }
      
      const displayName = result[0].app_name || result[0].name || 'Soltiva'
      return {
        statusCode: 200,
        headers: { 
          'content-type': 'application/json',
          'cache-control': 'no-store, max-age=0'
        },
        body: JSON.stringify({ app_name: displayName })
      }
    }

    // Query based on icon type
    let result
    if (iconType === 'favicon') {
      result = await sql`
        SELECT favicon as icon_data
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `
    } else if (iconType === '192') {
      result = await sql`
        SELECT app_icon_192 as icon_data
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `
    } else if (iconType === '512') {
      result = await sql`
        SELECT app_icon_512 as icon_data
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `
    } else {
      return {
        statusCode: 400,
        body: 'Invalid type parameter'
      }
    }
    
    if (result.length === 0 || !result[0].icon_data) {
      return {
        statusCode: 404,
        body: 'Icon not found'
      }
    }

    const base64Data = result[0].icon_data.split(',')[1] || result[0].icon_data

    // netlify/functions/serve-icon.mjs (only the return part)

return {
  statusCode: 200,
  headers: {
    'Content-Type': 'image/png',
    // ✅ biggest impact: do NOT let Safari/iOS cache this aggressively
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
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