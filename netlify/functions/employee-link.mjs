import crypto from 'crypto'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return createLink(event)     // admin generates link
  if (event.httpMethod === 'GET') return resolveLink(event)     // employee uses token
  return cors(405, { error: 'Method not allowed' })
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

function randomToken() {
  // 32 bytes => 64 hex chars
  return crypto.randomBytes(32).toString('hex')
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

    // ensure employee belongs to tenant
    const emp = await sql`
      SELECT id
      FROM employees
      WHERE id = ${employee_id} AND tenant_id = ${TENANT_ID}
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' })

    const token = randomToken()
    const token_hash = sha256(token)

    await sql`
      UPDATE employees
      SET share_token_hash = ${token_hash},
          share_token_created_at = NOW()
      WHERE id = ${employee_id} AND tenant_id = ${TENANT_ID}
    `

    const baseUrl =
      (process.env.URL && String(process.env.URL)) ||
      'https://data-entry-beta.netlify.app'

    const url = `${baseUrl}/time-entry?employee_token=${encodeURIComponent(token)}`

    return cors(200, { ok: true, url })
  } catch (e) {
    console.error('employee-link createLink error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

/**
 * GET /api/employee-link?employee_token=...
 * No normal app auth required.
 * Returns: { employee: {id,name,employee_code} }
 */
async function resolveLink(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const params = new URLSearchParams(event.queryStringParameters || {})
    const token = params.get('employee_token')
    if (!token) return cors(400, { error: 'employee_token is required' })

    const token_hash = sha256(token)

    const rows = await sql`
      SELECT id, tenant_id, name, employee_code, active
      FROM employees
      WHERE share_token_hash = ${token_hash}
      LIMIT 1
    `
    if (rows.length === 0) return cors(404, { error: 'Invalid link' })
    if (!rows[0].active) return cors(403, { error: 'Employee is inactive' })

    return cors(200, {
      ok: true,
      employee: {
        id: rows[0].id,
        tenant_id: rows[0].tenant_id,
        name: rows[0].name,
        employee_code: rows[0].employee_code || null,
      },
    })
  } catch (e) {
    console.error('employee-link resolveLink error:', e)
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
