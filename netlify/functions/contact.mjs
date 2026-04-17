import { neon } from '@neondatabase/serverless'
import { resolveAuthz, getUserFromToken } from './utils/auth.mjs'

const cors = (status, body) => ({
  statusCode: status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
  },
  body: JSON.stringify(body),
})

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})

  const sql = neon(process.env.DATABASE_URL)

  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return cors(401, { error: authz.error })

  const user = getUserFromToken(event)
  if (!user?.email) return cors(401, { error: 'Could not resolve user email' })

  // ── GET ───────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      let rows

      if (authz.role === 'super_admin' && !authz.tenantId) {
        // Super admin with no tenant selected → all messages across all tenants
        rows = await sql`
          SELECT
            cm.id,
            cm.topic,
            cm.message,
            cm.sent_at,
            cm.answered_at,
            cm.reply,
            cm.replied_at,
            cm.user_email,
            t.name AS tenant_name
          FROM contact_messages cm
          LEFT JOIN tenants t ON t.id = cm.tenant_id
          ORDER BY cm.sent_at DESC
        `
      } else if (authz.role === 'super_admin' && authz.tenantId) {
        // Super admin with a tenant selected → only that tenant's messages
        rows = await sql`
          SELECT
            cm.id,
            cm.topic,
            cm.message,
            cm.sent_at,
            cm.answered_at,
            cm.reply,
            cm.replied_at,
            cm.user_email,
            t.name AS tenant_name
          FROM contact_messages cm
          LEFT JOIN tenants t ON t.id = cm.tenant_id
          WHERE cm.tenant_id = ${authz.tenantId}::uuid
          ORDER BY cm.sent_at DESC
        `
      } else {
        // Regular user → only their own messages for their tenant
        rows = await sql`
          SELECT id, topic, message, sent_at, answered_at, reply, replied_at
          FROM contact_messages
          WHERE tenant_id  = ${authz.tenantId}::uuid
            AND user_email = ${user.email}
          ORDER BY sent_at DESC
        `
      }

      return cors(200, { messages: rows })
    } catch (err) {
      console.error('contact GET error:', err)
      return cors(500, { error: 'Failed to fetch messages' })
    }
  }

  // ── POST: save to DB + forward to Netlify Forms ───────────────────────────
  if (event.httpMethod === 'POST') {
    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return cors(400, { error: 'Invalid JSON' })
    }

    const { topic, message } = body
    if (!topic || !message) return cors(400, { error: 'Missing required fields' })

    try {
      await sql`
        INSERT INTO contact_messages (tenant_id, user_email, topic, message)
        VALUES (
          ${authz.tenantId}::uuid,
          ${user.email},
          ${topic},
          ${message}
        )
      `

      try {
        const formData = new URLSearchParams({
          'form-name': 'contact',
          topic,
          email: user.email,
          message,
        })
        await fetch(`${process.env.URL || 'https://data-entry-beta.netlify.app'}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        })
      } catch (formErr) {
        console.warn('Netlify Forms forward failed:', formErr)
      }

      return cors(200, { ok: true })
    } catch (err) {
      console.error('contact POST error:', err)
      return cors(500, { error: 'Failed to save message' })
    }
  }

  // ── PATCH: mark answered/unanswered (Super Admin only) ────────────────────
  if (event.httpMethod === 'PATCH') {
    if (authz.role !== 'super_admin') return cors(403, { error: 'Super admin only' })

    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return cors(400, { error: 'Invalid JSON' })
    }

    const { id, answered, reply } = body
    if (!id) return cors(400, { error: 'Missing message id' })

    try {
      if (reply !== undefined) {
        // Look up the message to get tenant, sender, and whether a reply already exists
        const [msg] = await sql`
          SELECT tenant_id, user_email, reply AS existing_reply FROM contact_messages WHERE id = ${id}::uuid
        `
        if (!msg) return cors(404, { error: 'Message not found' })

        // Save reply and replied_at only — answered_at stays independent (checkbox)
        const now = new Date().toISOString()
        await sql`
          UPDATE contact_messages
          SET reply      = ${reply},
              replied_at = ${now}
          WHERE id = ${id}::uuid
        `

        // Only notify via external_events on first reply, not on edits
        if (!msg.existing_reply) {
          await sql`
            INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
            VALUES (${msg.tenant_id}::uuid, 'message_reply', ${msg.user_email}, ${JSON.stringify({ via: 'app' })})
          `
        }
      } else {
        // Toggle answered/unanswered
        await sql`
          UPDATE contact_messages
          SET answered_at = ${answered ? new Date().toISOString() : null}
          WHERE id = ${id}::uuid
        `

        // When manually marking as answered via email, insert external event
        if (answered) {
          const [msg] = await sql`
            SELECT tenant_id, user_email FROM contact_messages WHERE id = ${id}::uuid
          `
          if (msg) {
            await sql`
              INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
              VALUES (${msg.tenant_id}::uuid, 'message_reply', ${msg.user_email}, ${JSON.stringify({ via: 'email' })})
            `
          }
        }
      }
      return cors(200, { ok: true })
    } catch (err) {
      console.error('contact PATCH error:', err)
      return cors(500, { error: 'Failed to update message' })
    }
  }

  return cors(405, { error: 'Method not allowed' })
}