// netlify/functions/save-reminder-settings.mjs
// POST /api/save-reminder-settings
// Body: { action, ...data }
// Actions: create_rule | update_rule | delete_rule | toggle_rule | upsert_template

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return saveSettings(event)
  return cors(405, { error: 'Method not allowed' })
}

async function saveSettings(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { action } = body

    if (action === 'create_rule') {
      const { rule_name, trigger_event, minutes_offset, channel, template_key, service_id } = body
      if (!rule_name || !trigger_event || !channel || !template_key) {
        return cors(400, { error: 'rule_name, trigger_event, channel and template_key are required' })
      }
      const rows = await sql`
        INSERT INTO reminder_rules
          (tenant_id, rule_name, trigger_event, minutes_offset, channel, template_key, service_id, active)
        VALUES
          (${TENANT_ID}, ${rule_name}, ${trigger_event}, ${parseInt(minutes_offset ?? 0, 10)},
           ${channel}, ${template_key}, ${service_id ?? null}, true)
        RETURNING id
      `
      return cors(200, { ok: true, id: rows[0].id })
    }

    if (action === 'update_rule') {
      const { id, rule_name, trigger_event, minutes_offset, channel, template_key, service_id } = body
      if (!id) return cors(400, { error: 'id is required' })
      await sql`
        UPDATE reminder_rules SET
          rule_name      = ${rule_name},
          trigger_event  = ${trigger_event},
          minutes_offset = ${parseInt(minutes_offset ?? 0, 10)},
          channel        = ${channel},
          template_key   = ${template_key},
          service_id     = ${service_id ?? null},
          updated_at     = now()
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
      return cors(200, { ok: true })
    }

    if (action === 'toggle_rule') {
      const { id, active } = body
      if (!id) return cors(400, { error: 'id is required' })
      await sql`
        UPDATE reminder_rules SET active = ${!!active}, updated_at = now()
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
      return cors(200, { ok: true })
    }

    if (action === 'delete_rule') {
      const { id } = body
      if (!id) return cors(400, { error: 'id is required' })
      await sql`DELETE FROM reminder_rules WHERE id = ${id} AND tenant_id = ${TENANT_ID}`
      return cors(200, { ok: true })
    }

    if (action === 'upsert_template') {
      const { template_key, channel, subject, body: tmplBody } = body
      if (!template_key || !channel || !tmplBody) {
        return cors(400, { error: 'template_key, channel and body are required' })
      }
      await sql`
        INSERT INTO message_templates (tenant_id, template_key, channel, subject, body)
        VALUES (${TENANT_ID}, ${template_key}, ${channel}, ${subject ?? null}, ${tmplBody})
        ON CONFLICT (tenant_id, template_key, channel)
          DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = now()
      `
      return cors(200, { ok: true })
    }

    return cors(400, { error: `Unknown action: ${action}` })
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
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
