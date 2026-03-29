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

    // Seed default booking confirmation template if none exists for this tenant
    await sql`
      INSERT INTO message_templates (tenant_id, template_key, channel, body)
      VALUES (
        ${TENANT_ID},
        'booking_confirmation',
        'sms',
        'Hi {{customer_name}}, your booking for {{service_name}} on {{start_date}} at {{start_time}} is confirmed. See you then!'
      )
      ON CONFLICT (tenant_id, template_key, channel) DO NOTHING
    `

    // Seed default booking confirmation rule if no booking_confirmed rule exists yet
    const existingConfirmRule = await sql`
      SELECT id FROM reminder_rules
      WHERE tenant_id = ${TENANT_ID} AND trigger_event = 'booking_confirmed'
      LIMIT 1
    `
    if (!existingConfirmRule.length) {
      await sql`
        INSERT INTO reminder_rules
          (tenant_id, rule_name, trigger_event, minutes_offset, channel, template_key, service_id, active)
        VALUES
          (${TENANT_ID}, 'Booking confirmation', 'booking_confirmed', 0, 'sms', 'booking_confirmation', null, true)
      `
    }

    const rules = await sql`
      SELECT
        r.id, r.rule_name, r.trigger_event, r.minutes_offset,
        r.channel, r.template_key, r.active, r.created_at,
        r.service_id,
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
