// netlify/functions/get-reminder-settings.mjs
// GET /api/get-reminder-settings
// Returns reminder_rules and message_templates for the tenant.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getSettings(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getSettings(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const rules = await sql`
      SELECT
        r.id, r.rule_name, r.trigger_event, r.minutes_offset,
        r.channel, r.template_key, r.active, r.created_at,
        s.name AS service_name
      FROM reminder_rules r
      LEFT JOIN services s ON s.id = r.service_id AND s.tenant_id = ${TENANT_ID}
      WHERE r.tenant_id = ${TENANT_ID}
      ORDER BY r.trigger_event, r.minutes_offset
    `

    const templates = await sql`
      SELECT id, template_key, channel, subject, body, updated_at
      FROM message_templates
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY template_key
    `

    // Also return available services for the rule form
    const services = await sql`
      SELECT id, name FROM services
      WHERE tenant_id = ${TENANT_ID} AND active = true
      ORDER BY name
    `

    return cors(200, { rules, templates, services })
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
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
