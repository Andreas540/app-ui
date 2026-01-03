// netlify/functions/employee-link.mjs
import crypto from 'crypto'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'POST') return createLink(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

/**
 * HMAC token generation (must match employee-session.mjs verify)
 * token = "<payloadB64url>.<sigB64url>"
 */
function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function generateEmployeeToken({ tenantId, employeeId, expiresInDays = 365 }) {
  const secret = process.env.EMPLOYEE_TOKEN_SECRET
  if (!secret) throw new Error('EMPLOYEE_TOKEN_SECRET missing')

  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60

  const payload = {
    tenant_id: String(tenantId),
    employee_id: String(employeeId),
    exp,
  }

  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const sigB64 = base64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )

  return `${payloadB64}.${sigB64}`
}

/**
 * POST /api/employee-link
 * Body: { employee_id: "uuid" }
 * Auth: app auth (resolveAuthz)
 * Returns: { ok: true, url, token }
 */
async function createLink(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error }, event)

    // NOTE: authz.tenantId should be a uuid string. We still cast in SQL to avoid uuid/text mismatch.
    const TENANT_ID = String(authz.tenantId)

    const body = JSON.parse(event.body || '{}')
    const employee_id = body.employee_id ? String(body.employee_id) : ''
    if (!employee_id) return cors(400, { error: 'employee_id is required' }, event)

    // Ensure employee belongs to tenant + is active
    // IMPORTANT: cast BOTH sides to uuid to avoid "uuid vs text" mismatch.
    const emp = await sql`
      SELECT id, active
      FROM employees
      WHERE id = ${employee_id}::uuid
        AND tenant_id = ${TENANT_ID}::uuid
      LIMIT 1
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
    if (!emp[0].active) return cors(400, { error: 'Employee is inactive' }, event)

    const token = generateEmployeeToken({
      tenantId: TENANT_ID,
      employeeId: employee_id,
      expiresInDays: 365,
    })

    // Build URL for the SAME site/environment that served this function
    const host = event?.headers?.host
    const proto = String(event?.headers?.['x-forwarded-proto'] || 'https')
      .split(',')[0]
      .trim()

    const baseUrl = host
      ? `${proto}://${host}`
      : process.env.URL
        ? String(process.env.URL)
        : ''

    if (!baseUrl) return cors(500, { error: 'Could not determine baseUrl (missing host/URL)' }, event)

    const url = `${baseUrl}/time-entry-simple/${encodeURIComponent(token)}`

    return cors(200, { ok: true, url, token }, event)
  } catch (e) {
    console.error('employee-link createLink error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

function cors(status, body, event) {
  // employee-link is called from the authenticated app.
  // Keeping "*" is fine here because this endpoint does NOT set cookies.
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}



