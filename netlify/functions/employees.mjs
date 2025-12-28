// netlify/functions/employees.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getEmployees(event)
  if (event.httpMethod === 'POST') return saveEmployee(event)
  if (event.httpMethod === 'DELETE') return deleteEmployee(event)
  return cors(405, { error: 'Method not allowed' })
}

/**
 * GET employees
 * Query params:
 *   - active: filter by active status (true/false)
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

/**
 * POST: Save employee
 * Body: {
 *   id?: "uuid" (for updates),
 *   name: "John Doe",
 *   email: "john@example.com",
 *   employee_code: "EMP001",
 *   active: true,
 *   notes: "Optional notes"
 * }
 */
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
    const { id, name, email, employee_code, active, notes } = body

    // Validation
    if (!name || !name.trim()) {
      return cors(400, { error: 'name is required' })
    }

    if (id) {
      // Update existing employee
      await sql`
        UPDATE employees
        SET 
          name = ${name.trim()},
          email = ${email?.trim() || null},
          employee_code = ${employee_code?.trim() || null},
          active = ${active !== false},
          notes = ${notes?.trim() || null}
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `

      return cors(200, { ok: true, updated: true, id })
    } else {
      // Insert new employee
      const result = await sql`
        INSERT INTO employees (
          tenant_id, name, email, employee_code, active, notes
        )
        VALUES (
          ${TENANT_ID},
          ${name.trim()},
          ${email?.trim() || null},
          ${employee_code?.trim() || null},
          ${active !== false},
          ${notes?.trim() || null}
        )
        RETURNING id
      `

      return cors(200, { ok: true, created: true, id: result[0].id })
    }
  } catch (e) {
    console.error(e)
    
    // Handle unique constraint violation for employee_code
    if (e.message?.includes('uq_employees_tenant_code')) {
      return cors(400, { error: 'Employee code already exists' })
    }
    
    return cors(500, { error: String(e?.message || e) })
  }
}

/**
 * DELETE: Remove employee (soft delete - set active=false)
 * Query params: id (employee ID)
 */
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

    if (!id) {
      return cors(400, { error: 'id parameter is required' })
    }

    // Soft delete: set active = false instead of deleting
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}