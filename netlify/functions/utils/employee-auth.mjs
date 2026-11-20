// netlify/functions/utils/employee-auth.mjs
//
// Who is calling a time-entry endpoint. Three accepted identities, in priority order:
//
//   1. employee, via a legacy HMAC token in x-employee-token
//   2. employee, via the HttpOnly employee_session cookie (the current scheme)
//   3. an ordinary logged-in app user, via resolveAuthz
//
// Moved here out of time-entries.mjs so the breaks endpoint shares one implementation
// rather than carrying a second copy. Behaviour is unchanged from that original.
//
// The distinction that matters to callers is `mode`. An 'employee' caller is a person
// on a phone on the shop floor: their identity is fixed by the session, they may only
// touch their own rows, and the server — not their device — decides what time it is.
// An 'app' caller is an admin who may legitimately enter times for a past shift.

import crypto from 'crypto'
import { resolveAuthz } from './auth.mjs'
import { FALLBACK_TZ } from './tz.mjs'

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

export function verifyEmployeeToken(token) {
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

export function parseCookies(cookieHeader) {
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

/**
 * Resolves the caller. Returns { error } on any failure, otherwise
 * { mode: 'employee', tenantId, employeeId, timezone } or
 * { mode: 'app', tenantId, userId }.
 *
 * `timezone` is the tenant's configured default, resolved here so an employee-mode
 * handler can stamp the time without a second round trip. It is only filled in for
 * employee mode, because app mode takes its times from the request.
 */
export async function getAuthContext({ sql, event }) {
  const h = event.headers || {}

  // 1) Legacy: token in header (kept for backward compatibility)
  const empToken =
    h['x-employee-token'] ||
    h['X-Employee-Token'] ||
    h['x-employee-token'.toLowerCase()] ||
    h['x-employee-token'.toUpperCase()]

  if (empToken) {
    const v = verifyEmployeeToken(empToken)
    if (v.error) return { error: v.error }
    const tzRows = await sql`
      SELECT default_timezone FROM tenants WHERE id = ${v.tenantId}::uuid LIMIT 1
    `.catch(() => [])
    return {
      mode: 'employee',
      tenantId: v.tenantId,
      employeeId: v.employeeId,
      timezone: tzRows[0]?.default_timezone || FALLBACK_TZ,
    }
  }

  // 2) employee_session cookie
  const cookieHeader = h.cookie || h.Cookie || ''
  const cookies = parseCookies(cookieHeader)
  const employeeSession = cookies.employee_session

  if (employeeSession) {
    const rows = await sql`
      SELECT es.tenant_id, es.employee_id, e.active, t.default_timezone
      FROM employee_sessions es
      JOIN employees e ON e.id = es.employee_id
      -- LEFT, not inner: an inner join would turn a session whose tenant row is
      -- missing into "session expired" rather than letting it through as before.
      -- The timezone falls back below in that case.
      LEFT JOIN tenants t ON t.id = es.tenant_id
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
        timezone: rows[0].default_timezone || FALLBACK_TZ,
      }
    }
    return { error: 'Employee session expired (open your personal link again)' }
  }

  // 3) App mode (normal login)
  const authz = await resolveAuthz({ sql, event })
  if (authz.error) return { error: authz.error }
  return { mode: 'app', tenantId: authz.tenantId, userId: authz.actingUserId }
}
