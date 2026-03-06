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

  const authz = await resolveAuthz(event)
  if (authz.error) return cors(401, { error: authz.error })

  const user = getUserFromToken(event)
  if (!user?.email) return cors(401, { error: 'Could not resolve user email' })

  const sql = neon(process.env.DATABASE_URL)

  // ── GET: fetch messages for this user ─────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const rows = await sql`
        SELECT id, topic, message, sent_at, answered_at
        FROM contact_messages
        WHERE tenant_id  = ${authz.tenantId}::uuid
          AND user_email = ${user.email}
        ORDER BY sent_at DESC
      `
      return cors(200, { messages: rows })
    } catch (err) {
      console.error('contact GET error:', err)
      return cors(500, { error: 'Failed to fetch messages' })
    }
  }

  // ── POST: save a new message ──────────────────────────────────────────────
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
      return cors(200, { ok: true })
    } catch (err) {
      console.error('contact POST error:', err)
      return cors(500, { error: 'Failed to save message' })
    }
  }

  // ── PATCH: mark a message as answered (Super Admin only) ──────────────────
  if (event.httpMethod === 'PATCH') {
    if (authz.role !== 'super_admin') return cors(403, { error: 'Super admin only' })

    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return cors(400, { error: 'Invalid JSON' })
    }

    const { id, answered } = body
    if (!id) return cors(400, { error: 'Missing message id' })

    try {
      await sql`
        UPDATE contact_messages
        SET answered_at = ${answered ? new Date().toISOString() : null}
        WHERE id = ${id}::uuid
      `
      return cors(200, { ok: true })
    } catch (err) {
      console.error('contact PATCH error:', err)
      return cors(500, { error: 'Failed to update message' })
    }
  }

  return cors(405, { error: 'Method not allowed' })
}