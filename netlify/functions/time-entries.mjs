// netlify/functions/time-entries.mjs

import { checkMaintenance } from './utils/maintenance.mjs'
import { resolveAuthz } from './utils/auth.mjs'
import crypto from 'crypto'

export async function handler(event) {
  // 🔴 Add this check
  const check = checkMaintenance()
  if (check) return check
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'GET') return getTimeEntries(event)
  if (event.httpMethod === 'POST') return saveTimeEntry(event)
  if (event.httpMethod === 'DELETE') return deleteTimeEntry(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

/**
 * Employee-token helpers (HMAC signed token) [legacy header mode]
 */
function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function base64urlDecodeToString(b64url) {
  const b64 = String(b64url).replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64').toString('utf8')
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}
function verifyEmployeeToken(token) {
  const secret = process.env.EMPLOYEE_TOKEN_SECRET
  if (!secret) return { error: 'EMPLOYEE_TOKEN_SECRET missing' }
  if (!token) return { error: 'Missing employee token' }

  const parts = String(token).split('.')
  if (parts.length !== 2) return { error: 'Invalid token format' }

  const [payloadB64, sigB64] = parts

  let payloadStr = ''
  try {
    payloadStr = base64urlDecodeToString(payloadB64)
  } catch {
    return { error: 'Invalid token payload encoding' }
  }

  let payload
  try {
    payload = JSON.parse(payloadStr)
  } catch {
    return { error: 'Invalid token payload JSON' }
  }

  const expectedSig = base64urlEncode(crypto.createHmac('sha256', secret).update(payloadB64).digest())
  if (!safeEqual(expectedSig, sigB64)) return { error: 'Invalid token signature' }

  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp)) return { error: 'Invalid token exp' }
  const now = Math.floor(Date.now() / 1000)
  if (now > exp) return { error: 'Token expired' }

  if (!payload?.tenant_id || !payload?.employee_id) return { error: 'Token missing fields' }

  return { tenantId: String(payload.tenant_id), employeeId: String(payload.employee_id) }
}

/**
 * Cookie helpers (for Solution B: HttpOnly employee_session cookie)
 */
function parseCookies(cookieHeader) {
  const out = {}
  if (!cookieHeader) return out
  const parts = String(cookieHeader).split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (!k) continue
    out[k] = decodeURIComponent(rest.join('=') || '')
  }
  return out
}

async function getAuthContext({ sql, event }) {
  const h = event.headers || {}

  // 1) Legacy: token in header (keep for backward compatibility)
  const empToken =
    h['x-employee-token'] ||
    h['X-Employee-Token'] ||
    h['x-employee-token'.toLowerCase()] ||
    h['x-employee-token'.toUpperCase()]

  if (empToken) {
    const v = verifyEmployeeToken(empToken)
    if (v.error) return { error: v.error }
    return { mode: 'employee', tenantId: v.tenantId, employeeId: v.employeeId }
  }

  // 2) NEW (Solution B): employee_session cookie
  const cookieHeader = h.cookie || h.Cookie || ''
  const cookies = parseCookies(cookieHeader)
  const employeeSession = cookies.employee_session

  if (employeeSession) {
    const rows = await sql`
      SELECT es.tenant_id, es.employee_id, e.active
      FROM employee_sessions es
      JOIN employees e ON e.id = es.employee_id
      WHERE es.session_token = ${employeeSession}
        AND es.expires_at > now()
      LIMIT 1
    `
    if (rows.length > 0) {
      if (!rows[0].active) return { error: 'Employee is inactive' }
      return {
        mode: 'employee',
        tenantId: String(rows[0].tenant_id),
        employeeId: String(rows[0].employee_id),
      }
    }
    return { error: 'Employee session expired (open your personal link again)' }
  }

  // 3) App mode (normal login)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return { error: authz.error }
  return { mode: 'app', tenantId: authz.tenantId }
}

/**
 * GET time entries
 */
async function getTimeEntries(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)
    const ctx = await getAuthContext({ sql, event })
    if (ctx.error) return cors(403, { error: ctx.error }, event)

    const TENANT_ID = ctx.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})

    if (ctx.mode === 'employee' && params.get('me') === 'true') {
      const emp = await sql`
        SELECT id, name, employee_code, active
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND id = ${ctx.employeeId}::uuid
        LIMIT 1
      `
      if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
      return cors(200, { employee: emp[0] }, event)
    }

    const employeeId = ctx.mode === 'employee' ? ctx.employeeId : params.get('employee_id') || null

    const from = params.get('from') || null
    const to = params.get('to') || null
    const approvedParam = params.get('approved')
    const approved = approvedParam === null || approvedParam === undefined ? null : approvedParam === 'true'

    const rows = await sql`
      SELECT
        te.id,
        te.employee_id,
        e.name as employee_name,
        te.work_date,
        to_char(te.start_time, 'HH24:MI') as start_time,
        to_char(te.end_time, 'HH24:MI') as end_time,
        te.total_hours::float8 as total_hours,
        te.salary::float8 as salary,
        te.approved,
        te.approved_by,
        te.approved_at,
        te.notes,
        te.created_at,
        te.updated_at
      FROM time_entries te
      JOIN employees e ON e.id = te.employee_id
      WHERE te.tenant_id = ${TENANT_ID}
        AND (${employeeId}::uuid IS NULL OR te.employee_id = ${employeeId}::uuid)
        AND (${from}::date IS NULL OR te.work_date >= ${from}::date)
        AND (${to}::date IS NULL OR te.work_date <= ${to}::date)
        AND (${approved}::boolean IS NULL OR te.approved = ${approved}::boolean)
      ORDER BY te.work_date DESC, e.name
    `
    return cors(200, rows, event)
  } catch (e) {
    console.error('getTimeEntries error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * POST: Save time entry
 */
async function saveTimeEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)
    const ctx = await getAuthContext({ sql, event })
    if (ctx.error) return cors(403, { error: ctx.error }, event)

    const TENANT_ID = ctx.tenantId
    const body = JSON.parse(event.body || '{}')
    const { employee_id, work_date, start_time, end_time, notes } = body

    const effectiveEmployeeId = ctx.mode === 'employee' ? ctx.employeeId : employee_id

    if (!effectiveEmployeeId) return cors(400, { error: 'employee_id is required' }, event)
    if (!work_date) return cors(400, { error: 'work_date is required' }, event)

    // Allow partial time entries (only start_time OR only end_time OR both)
    if (!start_time && !end_time) {
      return cors(400, { error: 'At least start_time or end_time is required' }, event)
    }

    const emp = await sql`
      SELECT id, active
      FROM employees
      WHERE tenant_id = ${TENANT_ID} AND id = ${effectiveEmployeeId}::uuid
      LIMIT 1
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
    if (!emp[0].active) return cors(400, { error: 'Employee is inactive' }, event)

    const existing = await sql`
      SELECT id, approved, start_time, end_time, notes
      FROM time_entries
      WHERE tenant_id = ${TENANT_ID}
        AND employee_id = ${effectiveEmployeeId}::uuid
        AND work_date = ${work_date}::date
    `

    if (existing.length > 0) {
      const entry = existing[0]
      if (entry.approved) return cors(400, { error: 'Cannot edit approved time entry' }, event)

      const updatedStartTime = start_time !== undefined ? start_time : entry.start_time
      const updatedEndTime = end_time !== undefined ? end_time : entry.end_time
      const updatedNotes = notes !== undefined ? notes : entry.notes

      await sql`
        UPDATE time_entries
        SET
          start_time = ${updatedStartTime},
          end_time = ${updatedEndTime},
          notes = ${updatedNotes || null},
          updated_at = NOW()
        WHERE id = ${entry.id} AND tenant_id = ${TENANT_ID}
      `
      return cors(200, { ok: true, updated: true, id: entry.id }, event)
    }

    const result = await sql`
      INSERT INTO time_entries (
        tenant_id, employee_id, work_date,
        start_time, end_time, notes
      )
      VALUES (
        ${TENANT_ID},
        ${effectiveEmployeeId}::uuid,
        ${work_date}::date,
        ${start_time || null},
        ${end_time || null},
        ${notes || null}
      )
      RETURNING id
    `
    return cors(200, { ok: true, created: true, id: result[0].id }, event)
  } catch (e) {
    console.error('saveTimeEntry error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * DELETE: Remove time entry
 */
async function deleteTimeEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)
    const ctx = await getAuthContext({ sql, event })
    if (ctx.error) return cors(403, { error: ctx.error }, event)

    const TENANT_ID = ctx.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const id = params.get('id')
    if (!id) return cors(400, { error: 'id parameter is required' }, event)

    const entry = await sql`
      SELECT approved, employee_id
      FROM time_entries
      WHERE id = ${id}::uuid AND tenant_id = ${TENANT_ID}
      LIMIT 1
    `
    if (entry.length === 0) return cors(404, { error: 'Time entry not found' }, event)
    if (entry[0].approved) return cors(400, { error: 'Cannot delete approved time entry' }, event)

    if (ctx.mode === 'employee') {
      if (String(entry[0].employee_id) !== String(ctx.employeeId)) {
        return cors(403, { error: 'Not allowed' }, event)
      }
    }

    await sql`
      DELETE FROM time_entries
      WHERE id = ${id}::uuid AND tenant_id = ${TENANT_ID}
    `
    return cors(200, { ok: true, deleted: id }, event)
  } catch (e) {
    console.error('deleteTimeEntry error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * CORS helper for cookie-based auth:
 * - must NOT use '*'
 * - must set allow-credentials
 * - must echo origin (or fall back to your own site)
 */
function cors(status, body, event) {
  const h = event?.headers || {}
  const origin = h.origin || h.Origin || ''

  // Never return '*' with credentials.
  // If Origin is missing, fall back to your own site.
  const allowOrigin = origin || 'https://data-entry-beta.netlify.app'

  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': allowOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers':
        'content-type,authorization,x-tenant-id,x-active-tenant,x-employee-token',
      'access-control-max-age': '86400',
    },
    body: JSON.stringify(body),
  }
}




