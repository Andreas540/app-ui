import crypto from 'crypto'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return createLink(event)
  return cors(405, { error: 'Method not allowed' })
}

// ✅ HMAC token functions (matching time-entries.mjs)
function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function generateEmployeeToken({ tenantId, employeeId, expiresInDays = 365 }) {
  const secret = process.env.EMPLOYEE_TOKEN_SECRET
  if (!secret) throw new Error('EMPLOYEE_TOKEN_SECRET missing')

  // Create payload with expiration
  const exp = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60)
  const payload = {
    tenant_id: tenantId,
    employee_id: employeeId,
    exp
  }

  // Encode payload as base64url
  const payloadB64 = base64urlEncode(JSON.stringify(payload))

  // Create HMAC signature
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest()
  const sigB64 = base64urlEncode(signature)

  // Return token in format: payload.signature
  return `${payloadB64}.${sigB64}`
}

/**
 * POST /api/employee-link
 * Body: { employee_id: "uuid" }
 * Auth: normal app auth required (resolveAuthz)
 * Returns: { url, token }
 */
async function createLink(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const employee_id = body.employee_id
    if (!employee_id) return cors(400, { error: 'employee_id is required' })

    // Ensure employee belongs to tenant
    const emp = await sql`
      SELECT id, active
      FROM employees
      WHERE id = ${employee_id}::uuid AND tenant_id = ${TENANT_ID}
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' })
    if (!emp[0].active) return cors(400, { error: 'Employee is inactive' })

    // ✅ Generate HMAC token (stateless, no DB storage needed)
    const token = generateEmployeeToken({
      tenantId: TENANT_ID,
      employeeId: employee_id,
      expiresInDays: 365 // Token valid for 1 year
    })

    const baseUrl =
      (process.env.URL && String(process.env.URL)) ||
      'https://data-entry-beta.netlify.app'

    const url = `${baseUrl}/time-entry-simple?employee_token=${encodeURIComponent(token)}`

    return cors(200, { ok: true, url, token })
  } catch (e) {
    console.error('employee-link createLink error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-employee-token',
    },
    body: JSON.stringify(body),
  }
}
