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
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    // Check if user is super admin
    if (!authz.isSuperAdmin) {
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
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    // Check if user is super admin
    if (!authz.isSuperAdmin) {
      return cors(403, { error: 'Super admin access required' })
    }

    const body = JSON.parse(event.body || '{}')
    const { tenant_id, icon_type, icon_data } = body

    if (!tenant_id || !icon_type || !icon_data) {
      return cors(400, { error: 'tenant_id, icon_type, and icon_data required' })
    }

    // icon_type should be: '192', '512', or 'favicon'
    // icon_data should be base64 encoded image data

    // Generate filename
    const filename = `${tenant_id}_${icon_type}.png`
    
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
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    // Check if user is super admin
    if (!authz.isSuperAdmin) {
      return cors(403, { error: 'Super admin access required' })
    }

    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')
    const iconType = params.get('icon_type')

    if (!tenantId || !iconType) {
      return cors(400, { error: 'tenant_id and icon_type required' })
    }

    // Reset to null in database
    const column = iconType === 'favicon' ? 'favicon' : `app_icon_${iconType}`
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