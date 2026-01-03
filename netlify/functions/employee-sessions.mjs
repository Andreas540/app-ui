// netlify/functions/employee-session.mjs
import crypto from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'POST') return createEmployeeSession(event)
  if (event.httpMethod === 'GET') return getEmployeeSession(event)
  if (event.httpMethod === 'DELETE') return deleteEmployeeSession(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

// --------------------
// Token verify helpers
// --------------------
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

// --------------
// Cookie helpers
// --------------
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

function makeSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

function cookieAttrs() {
  // SameSite=Lax is correct for opening from home screen / normal navigation
  return `HttpOnly; Secure; SameSite=Lax; Path=/`
}
function clearCookieHeader() {
  return `employee_session=; ${cookieAttrs()}; Max-Age=0`
}
function setCookieHeader(sessionToken, maxAgeSeconds) {
  return `employee_session=${encodeURIComponent(sessionToken)}; ${cookieAttrs()}; Max-Age=${maxAgeSeconds}`
}

// --------------------
// POST: create session
// --------------------
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

    // ✅ IMPORTANT: schema-qualified
    const emp = await sql`
      SELECT id, tenant_id, active, name, employee_code
      FROM public.employees
      WHERE tenant_id = ${v.tenantId} AND id = ${v.employeeId}::uuid
      LIMIT 1
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
    if (!emp[0].active) return cors(400, { error: 'Employee is inactive' }, event)

    const sessionToken = makeSessionToken()

    // Align session TTL with token exp (cap at 365 days)
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

    // ✅ IMPORTANT: schema-qualified
    await sql`
      INSERT INTO public.employee_sessions (session_token, tenant_id, employee_id, expires_at, created_at)
      VALUES (
        ${sessionToken},
        ${v.tenantId},
        ${v.employeeId}::uuid,
        NOW() + (${maxAgeSeconds}::int || ' seconds')::interval,
        NOW()
      )
    `

    return cors(
      200,
      { ok: true },
      event,
      { 'set-cookie': setCookieHeader(sessionToken, maxAgeSeconds) }
    )
  } catch (e) {
    console.error('employee-session create error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

// ------------------
// GET: read session
// ------------------
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

    // ✅ IMPORTANT: schema-qualified
    const rows = await sql`
      SELECT es.tenant_id, es.employee_id, e.name, e.employee_code, e.active
      FROM public.employee_sessions es
      JOIN public.employees e ON e.id = es.employee_id
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

// ---------------------
// DELETE: clear session
// ---------------------
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
      // ✅ IMPORTANT: schema-qualified
      await sql`DELETE FROM public.employee_sessions WHERE session_token = ${sessionToken}`
    }

    return cors(200, { ok: true }, event, { 'set-cookie': clearCookieHeader() })
  } catch (e) {
    console.error('employee-session delete error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

// ---------------------
// CORS for cookie auth
// ---------------------
function cors(status, body, event, extraHeaders = {}) {
  const h = event?.headers || {}
  const origin = h.origin || h.Origin || ''

  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin || 'https://data-entry-beta.netlify.app',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers':
        'content-type,authorization,x-tenant-id,x-active-tenant,x-employee-token',
      'access-control-max-age': '86400',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}



