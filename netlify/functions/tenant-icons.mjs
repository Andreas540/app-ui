// netlify/functions/tenant-icons.mjs
import { resolveAuthz } from './utils/auth.mjs'
import path from 'path'
import fs from 'fs'

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
    
    // For super admin endpoints, we need to check auth differently
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
      // Get icons for specific tenant
      const tenant = await sql`
        SELECT id, name, app_icon_192, app_icon_512, favicon
        FROM tenants
        WHERE id = ${tenantId}
      `
      if (tenant.length === 0) return cors(404, { error: 'Tenant not found' })
      return cors(200, tenant[0])
    } else {
      // Get all tenants with their icons
      const tenants = await sql`
        SELECT id, name, app_icon_192, app_icon_512, favicon
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
    const { getStore } = await import('@netlify/blobs')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    
    // Check super admin auth
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

    // Extract base64 data (remove data:image/png;base64, prefix if present)
    const base64Data = icon_data.split(',')[1] || icon_data
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64')
    
    // Generate filename
    const filename = `${tenant_id}_${icon_type}.png`
    
    // Save to Netlify Blobs
    const store = getStore('tenant-icons')
    await store.set(filename, imageBuffer, {
      metadata: {
        contentType: 'image/png',
        tenantId: tenant_id,
        iconType: icon_type
      }
    })
    
    // Update database
    const column = icon_type === 'favicon' ? 'favicon' : `app_icon_${icon_type}`
    await sql`
      UPDATE tenants
      SET ${sql(column)} = ${filename}
      WHERE id = ${tenant_id}
    `

    return cors(200, { 
      ok: true, 
      filename,
      message: `Icon ${icon_type} uploaded for tenant ${tenant_id}` 
    })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteTenantIcon(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { getStore } = await import('@netlify/blobs')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    
    // Check super admin auth (same as before...)
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

    // Get current filename from database
    const column = iconType === 'favicon' ? 'favicon' : `app_icon_${iconType}`
    const result = await sql`
      SELECT ${sql(column)} as filename
      FROM tenants
      WHERE id = ${tenantId}
    `
    
    const filename = result[0]?.filename
    
    // Delete from Netlify Blobs if exists
    if (filename) {
      const store = getStore('tenant-icons')
      await store.delete(filename)
    }

    // Reset database to null
    await sql`
      UPDATE tenants
      SET ${sql(column)} = NULL
      WHERE id = ${tenantId}
    `

    return cors(200, { ok: true, message: 'Icon deleted' })
  } catch (e) {
    console.error(e)
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