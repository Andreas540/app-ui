// netlify/functions/tenant-icons.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getTenantIcons(event)
  if (event.httpMethod === 'POST') return uploadTenantIcon(event)
  if (event.httpMethod === 'DELETE') return deleteTenantIcon(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getTenantIcons(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    
    // Get the JWT token
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader) {
      return cors(401, { error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify JWT and check if super admin
    const { verify } = await import('jsonwebtoken')
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    let decoded
    try {
      decoded = verify(token, JWT_SECRET)
    } catch (e) {
      return cors(401, { error: 'Invalid token' })
    }

    // Check if user is super admin
    if (decoded.role !== 'super_admin') {
      return cors(403, { error: 'Super admin access required' })
    }

    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')

    if (tenantId) {
      // Get icons for specific tenant (return metadata only, not full base64)
      const tenant = await sql`
        SELECT 
          id, 
          name, 
          CASE WHEN app_icon_192 IS NOT NULL THEN 'set' ELSE NULL END as app_icon_192,
          CASE WHEN app_icon_512 IS NOT NULL THEN 'set' ELSE NULL END as app_icon_512,
          CASE WHEN favicon IS NOT NULL THEN 'set' ELSE NULL END as favicon
        FROM tenants
        WHERE id = ${tenantId}
      `
      if (tenant.length === 0) return cors(404, { error: 'Tenant not found' })
      return cors(200, tenant[0])
    } else {
      // Get all tenants with their icons
      const tenants = await sql`
        SELECT 
          id, 
          name, 
          CASE WHEN app_icon_192 IS NOT NULL THEN 'set' ELSE NULL END as app_icon_192,
          CASE WHEN app_icon_512 IS NOT NULL THEN 'set' ELSE NULL END as app_icon_512,
          CASE WHEN favicon IS NOT NULL THEN 'set' ELSE NULL END as favicon
        FROM tenants
        ORDER BY name
      `
      return cors(200, { tenants })
    }
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function uploadTenantIcon(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader) {
      return cors(401, { error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { verify } = await import('jsonwebtoken')
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    let decoded
    try {
      decoded = verify(token, JWT_SECRET)
    } catch (e) {
      return cors(401, { error: 'Invalid token' })
    }

    if (decoded.role !== 'super_admin') {
      return cors(403, { error: 'Super admin access required' })
    }

    const body = JSON.parse(event.body || '{}')
    const { tenant_id, icon_type, icon_data } = body

    if (!tenant_id || !icon_type || !icon_data) {
      return cors(400, { error: 'tenant_id, icon_type, and icon_data required' })
    }

    // Update based on icon type
    if (icon_type === 'favicon') {
      await sql`
        UPDATE tenants
        SET favicon = ${icon_data}
        WHERE id = ${tenant_id}
      `
    } else if (icon_type === '192') {
      await sql`
        UPDATE tenants
        SET app_icon_192 = ${icon_data}
        WHERE id = ${tenant_id}
      `
    } else if (icon_type === '512') {
      await sql`
        UPDATE tenants
        SET app_icon_512 = ${icon_data}
        WHERE id = ${tenant_id}
      `
    } else {
      return cors(400, { error: 'Invalid icon_type' })
    }

    return cors(200, { 
      ok: true, 
      message: `Icon ${icon_type} uploaded for tenant ${tenant_id}` 
    })
  } catch (e) {
    console.error('Upload error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteTenantIcon(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader) {
      return cors(401, { error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { verify } = await import('jsonwebtoken')
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return cors(500, { error: 'JWT_SECRET missing' })

    let decoded
    try {
      decoded = verify(token, JWT_SECRET)
    } catch (e) {
      return cors(401, { error: 'Invalid token' })
    }

    if (decoded.role !== 'super_admin') {
      return cors(403, { error: 'Super admin access required' })
    }

    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')
    const iconType = params.get('icon_type')

    if (!tenantId || !iconType) {
      return cors(400, { error: 'tenant_id and icon_type required' })
    }

    // Delete based on icon type
    if (iconType === 'favicon') {
      await sql`
        UPDATE tenants
        SET favicon = NULL
        WHERE id = ${tenantId}
      `
    } else if (iconType === '192') {
      await sql`
        UPDATE tenants
        SET app_icon_192 = NULL
        WHERE id = ${tenantId}
      `
    } else if (iconType === '512') {
      await sql`
        UPDATE tenants
        SET app_icon_512 = NULL
        WHERE id = ${tenantId}
      `
    } else {
      return cors(400, { error: 'Invalid icon_type' })
    }

    return cors(200, { ok: true, message: 'Icon deleted' })
  } catch (e) {
    console.error('Delete error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}