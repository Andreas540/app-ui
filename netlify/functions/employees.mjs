// netlify/functions/employees.mjs
import { resolveAuthz } from './utils/auth.mjs'
import crypto from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getEmployees(event)
  if (event.httpMethod === 'POST') return saveEmployee(event)
  if (event.httpMethod === 'DELETE') return deleteEmployee(event)
  return cors(405, { error: 'Method not allowed' })
}

// token signing helpers (same format as time-entries.mjs)
function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signEmployeeToken({ tenantId, employeeId, ttlDays = 365 }) {
  const secret = process.env.EMPLOYEE_TOKEN_SECRET
  if (!secret) throw new Error('EMPLOYEE_TOKEN_SECRET missing')

  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttlDays * 24 * 60 * 60

  const payload = { tenant_id: tenantId, employee_id: employeeId, exp }
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const sigB64 = base64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  return `${payloadB64}.${sigB64}`
}

/**
 * GET employees
 * Query params:
 *   - active=true/false
 *   - next_code=true : return { next_code: "EMP###" }
 *   - share_token=true&employee_id=<uuid> : return { url, token }
 */
async function getEmployees(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const active = params.get('active')
    const nextCode = params.get('next_code')

    // return next available employee code
    if (nextCode === 'true') {
      const code = await computeNextEmployeeCode({ sql, tenantId: TENANT_ID })
      return cors(200, { next_code: code })
    }

    // share token/link for one employee
    if (params.get('share_token') === 'true') {
      const employeeId = params.get('employee_id')
      if (!employeeId) return cors(400, { error: 'employee_id is required' })

      const emp = await sql`
        SELECT id, active
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND id = ${employeeId}::uuid
        LIMIT 1
      `
      if (emp.length === 0) return cors(404, { error: 'Employee not found' })
      if (!emp[0].active) return cors(400, { error: 'Employee is inactive' })

      const token = signEmployeeToken({ tenantId: TENANT_ID, employeeId })
      const url = `https://data-entry-beta.netlify.app/time-entry?t=${encodeURIComponent(token)}`
      return cors(200, { url, token })
    }

    let rows
    if (active === 'true') {
      rows = await sql`
        SELECT id, name, email, employee_code, active, notes, created_at, updated_at
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND active = TRUE
        ORDER BY name
      `
    } else if (active === 'false') {
      rows = await sql`
        SELECT id, name, email, employee_code, active, notes, created_at, updated_at
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND active = FALSE
        ORDER BY name
      `
    } else {
      rows = await sql`
        SELECT id, name, email, employee_code, active, notes, created_at, updated_at
        FROM employees
        WHERE tenant_id = ${TENANT_ID}
        ORDER BY active DESC, name
      `
    }

    return cors(200, rows)
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function computeNextEmployeeCode({ sql, tenantId }) {
  const rows = await sql`
    SELECT employee_code
    FROM employees
    WHERE tenant_id = ${tenantId}
      AND employee_code IS NOT NULL
      AND employee_code ILIKE 'EMP%'
  `
  let maxN = 0
  for (const r of rows) {
    const code = String(r.employee_code || '')
    const m = code.match(/^EMP(\d+)$/i)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > maxN) maxN = n
  }
  const next = maxN + 1
  return `EMP${String(next).padStart(3, '0')}`
}

async function saveEmployee(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { id, name, email, active, notes } = body

    if (!id && (!name || !name.trim())) {
      return cors(400, { error: 'name is required for new employees' })
    }

    if (id) {
      const employee = await sql`
        SELECT * FROM employees WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
      if (employee.length === 0) return cors(404, { error: 'Employee not found' })

      const current = employee[0]
      const updatedName = name !== undefined ? String(name).trim() : current.name
      const updatedEmail = email !== undefined ? (String(email).trim() || null) : current.email
      const updatedActive = active !== undefined ? active : current.active
      const updatedNotes = notes !== undefined ? (String(notes).trim() || null) : current.notes

      await sql`
        UPDATE employees
        SET 
          name = ${updatedName},
          email = ${updatedEmail},
          active = ${updatedActive},
          notes = ${updatedNotes}
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
      return cors(200, { ok: true, updated: true, id })
    } else {
      const generatedCode = await computeNextEmployeeCode({ sql, tenantId: TENANT_ID })

      const result = await sql`
        INSERT INTO employees (
          tenant_id, name, email, employee_code, active, notes
        )
        VALUES (
          ${TENANT_ID},
          ${String(name).trim()},
          ${String(email || '').trim() || null},
          ${generatedCode},
          ${active !== false},
          ${String(notes || '').trim() || null}
        )
        RETURNING id, employee_code
      `
      return cors(200, {
        ok: true,
        created: true,
        id: result[0].id,
        employee_code: result[0].employee_code,
      })
    }
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteEmployee(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const id = params.get('id')
    if (!id) return cors(400, { error: 'id parameter is required' })

    await sql`
      UPDATE employees
      SET active = FALSE
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    `
    return cors(200, { ok: true, deactivated: id })
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
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      // ✅ Point 4 solved here (x-employee-token is allowed)
      'access-control-allow-headers':
        'content-type,authorization,x-tenant-id,x-active-tenant,x-employee-token',
    },
    body: JSON.stringify(body),
  }
}


