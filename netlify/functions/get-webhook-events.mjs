// netlify/functions/get-webhook-events.mjs
// GET /api/get-webhook-events?tenantId=<uuid>&provider=simplybook&processed=false&limit=50&offset=0
// SuperAdmin-only: returns raw webhook_events rows for the log review UI.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    if (authz.role !== 'super_admin') return cors(403, { error: 'Super admin access required' })

    const q = event.queryStringParameters || {}
    const tenantId = q.tenantId || null
    const provider = q.provider || null
    // processed filter: 'true' | 'false' | null (all)
    const processedFilter = q.processed === 'true' ? true : q.processed === 'false' ? false : null
    const limit = Math.min(parseInt(q.limit || '50', 10), 200)
    const offset = parseInt(q.offset || '0', 10)

    const rows = await sql`
      SELECT
        we.id,
        we.tenant_id,
        t.name          AS tenant_name,
        we.provider,
        we.event_type,
        we.external_event_id,
        we.processed,
        we.processed_at,
        we.processing_error,
        we.created_at,
        we.payload
      FROM webhook_events we
      LEFT JOIN tenants t ON t.id = we.tenant_id
      WHERE (${tenantId}::uuid IS NULL OR we.tenant_id = ${tenantId}::uuid)
        AND (${provider}::text IS NULL OR we.provider = ${provider})
        AND (${processedFilter}::boolean IS NULL OR we.processed = ${processedFilter})
      ORDER BY we.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM webhook_events we
      WHERE (${tenantId}::uuid IS NULL OR we.tenant_id = ${tenantId}::uuid)
        AND (${provider}::text IS NULL OR we.provider = ${provider})
        AND (${processedFilter}::boolean IS NULL OR we.processed = ${processedFilter})
    `

    return cors(200, {
      events: rows,
      total: countRows[0].total,
      limit,
      offset,
    })
  } catch (e) {
    console.error('get-webhook-events error:', e)
    return cors(500, { error: String(e?.message || e) })
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
  }
}
