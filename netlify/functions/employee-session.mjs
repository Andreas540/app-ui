// netlify/functions/employee-session.mjs
import { checkMaintenance } from './utils/maintenance.mjs'
import crypto from 'crypto'

export async function handler(event) {
  // 🔴 Add this check
  const check = checkMaintenance()
  if (check) return check
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'POST') return createEmployeeSession(event)
  if (event.httpMethod === 'GET') return getEmployeeSession(event)
  if (event.httpMethod === 'DELETE') return deleteEmployeeSession(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

/** HMAC token verify (must match generator) */
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

  const expectedSig = base64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  if (!safeEqual(expectedSig, sigB64)) return { error: 'Invalid token signature' }

  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp)) return { error: 'Invalid token exp' }
  const now = Math.floor(Date.now() / 1000)
  if (now > exp) return { error: 'Token expired' }

  if (!payload?.tenant_id || !payload?.employee_id) return { error: 'Token missing fields' }

  return { tenantId: String(payload.tenant_id), employeeId: String(payload.employee_id) }
}

/** Cookie parsing */
function parseCookies(cookieHeader) {
  const out = {}
  if (!cookieHeader) return out
  for (const part of String(cookieHeader).split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (!k) continue
    out[k] = decodeURIComponent(rest.join('=') || '')
  }
  return out
}

function makeSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * IMPORTANT CHANGE:
 * - SameSite=None; Secure makes cookie usable reliably in:
 *   - iOS PWA standalone
 *   - link-opened contexts
 *   - immediate “POST set-cookie then GET” flows
 */
function cookieAttrs() {
  return `HttpOnly; Secure; SameSite=None; Path=/`
}
function clearCookieHeader() {
  return `employee_session=; ${cookieAttrs()}; Max-Age=0`
}
function setCookieHeader(sessionToken, maxAgeSeconds) {
  return `employee_session=${encodeURIComponent(sessionToken)}; ${cookieAttrs()}; Max-Age=${maxAgeSeconds}`
}

/**
 * POST /api/employee-session
 * Body: { token }
 * Sets HttpOnly cookie and creates DB session
 */
async function createEmployeeSession(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)

    const body = JSON.parse(event.body || '{}')
    const token = body.token
    const v = verifyEmployeeToken(token)
    if (v.error) return cors(403, { error: v.error }, event)

    // Confirm employee exists & is active
    const emp = await sql`
      SELECT id, tenant_id, active
      FROM employees
      WHERE tenant_id = ${v.tenantId}::uuid
        AND id = ${v.employeeId}::uuid
      LIMIT 1
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
    if (!emp[0].active) return cors(400, { error: 'Employee is inactive' }, event)

    const sessionToken = makeSessionToken()

    // Session length aligned with token exp, capped to 365d, min 60s
    const nowSec = Math.floor(Date.now() / 1000)
    const tokenExpSec = (() => {
      try {
        const payloadB64 = String(token).split('.')[0]
        const payloadStr = base64urlDecodeToString(payloadB64)
        const payload = JSON.parse(payloadStr)
        return Number(payload?.exp) || (nowSec + 86400)
      } catch {
        return nowSec + 86400
      }
    })()

    const maxAgeSeconds = Math.max(60, Math.min(365 * 24 * 60 * 60, tokenExpSec - nowSec))
    const expiresAtSql = await sql`SELECT NOW() + (${maxAgeSeconds}::int || ' seconds')::interval AS exp`
    const expiresAt = expiresAtSql?.[0]?.exp

    await sql`
      INSERT INTO employee_sessions (session_token, tenant_id, employee_id, expires_at, created_at)
      VALUES (
        ${sessionToken},
        ${v.tenantId}::uuid,
        ${v.employeeId}::uuid,
        ${expiresAt},
        NOW()
      )
    `

    // Use exact casing for Set-Cookie (some platforms are picky)
    return cors(200, { ok: true }, event, {
      'Set-Cookie': setCookieHeader(sessionToken, maxAgeSeconds),
    })
  } catch (e) {
    console.error('employee-session create error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * GET /api/employee-session
 * Returns whether cookie session is valid
 */
async function getEmployeeSession(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)
    const sql = neon(DATABASE_URL)

    const h = event.headers || {}
    const cookieHeader = h.cookie || h.Cookie || ''
    const cookies = parseCookies(cookieHeader)
    const sessionToken = cookies.employee_session
    if (!sessionToken) return cors(200, { active: false }, event)

    const rows = await sql`
      SELECT es.tenant_id, es.employee_id, e.name, e.employee_code, e.active
      FROM employee_sessions es
      JOIN employees e ON e.id = es.employee_id
      WHERE es.session_token = ${sessionToken}
        AND es.expires_at > now()
      LIMIT 1
    `
    if (rows.length === 0) return cors(200, { active: false }, event)
    if (!rows[0].active) return cors(200, { active: false }, event)

    return cors(
      200,
      {
        active: true,
        employee: {
          id: String(rows[0].employee_id),
          name: rows[0].name,
          employee_code: rows[0].employee_code,
          tenant_id: String(rows[0].tenant_id),
        },
      },
      event
    )
  } catch (e) {
    console.error('employee-session get error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * DELETE /api/employee-session
 * Clears cookie and deletes session row (best-effort)
 */
async function deleteEmployeeSession(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)
    const sql = neon(DATABASE_URL)

    const h = event.headers || {}
    const cookieHeader = h.cookie || h.Cookie || ''
    const cookies = parseCookies(cookieHeader)
    const sessionToken = cookies.employee_session

    if (sessionToken) {
      await sql`DELETE FROM employee_sessions WHERE session_token = ${sessionToken}`
    }

    return cors(200, { ok: true }, event, {
      'Set-Cookie': clearCookieHeader(),
    })
  } catch (e) {
    console.error('employee-session delete error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/** CORS helper (cookie auth friendly) */
function cors(status, body, event, extraHeaders = {}) {
  const h = event?.headers || {}
  const origin = h.origin || h.Origin || ''

  // Whitelist origins when using credentials (recommended)
  const allowed = new Set([
    'https://data-entry-beta.netlify.app',
    // add your custom domain here if you have one, e.g.:
    // 'https://yourdomain.com',
  ])

  const allowOrigin = allowed.has(origin) ? origin : 'https://data-entry-beta.netlify.app'

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
      'Vary': 'Origin',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}






