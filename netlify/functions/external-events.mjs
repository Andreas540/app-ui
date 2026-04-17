// netlify/functions/external-events.mjs
// GET /api/external-events  →  { events: [{id, event_type, customer_name, extra, created_at}] }
// Returns external-page activity for the last 24 h for the authenticated tenant.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')  return getEvents(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getEvents(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql    = neon(DATABASE_URL)
    const authz  = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const events = await sql`
      SELECT id, event_type, customer_name, extra, created_at
      FROM external_events
      WHERE tenant_id = ${authz.tenantId}::uuid
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `

    return cors(200, { events })
  } catch (e) {
    console.error('external-events error:', e)
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
