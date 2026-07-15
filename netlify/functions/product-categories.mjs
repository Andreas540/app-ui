// netlify/functions/product-categories.mjs

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('product-categories', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return list(event)
  if (event.httpMethod === 'POST')   return create(event)
  return cors(405, { error: 'Method not allowed' })
})

async function list(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const type = event.queryStringParameters?.type
  if (!type || !['category', 'subcategory'].includes(type))
    return cors(400, { error: 'type must be category or subcategory' })
  const rows = await sql`
    SELECT name FROM product_categories
    WHERE tenant_id = ${authz.tenantId} AND category_type = ${type}
    ORDER BY name
  `
  return cors(200, { categories: rows.map(r => r.name) })
}

async function create(event) {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
  const sql = neon(DATABASE_URL)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(403, { error: authz.error })
  const body = JSON.parse(event.body || '{}')
  const name = (body.name || '').trim()
  const type = body.type
  if (!name) return cors(400, { error: 'name is required' })
  if (!type || !['category', 'subcategory'].includes(type))
    return cors(400, { error: 'type must be category or subcategory' })
  await sql`
    INSERT INTO product_categories (tenant_id, name, category_type)
    VALUES (${authz.tenantId}, ${name}, ${type})
    ON CONFLICT (tenant_id, name, category_type) DO NOTHING
  `
  return cors(201, { name })
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
