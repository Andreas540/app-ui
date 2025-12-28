// netlify/functions/time-entries.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getTimeEntries(event)
  if (event.httpMethod === 'POST') return saveTimeEntry(event)
  if (event.httpMethod === 'DELETE') return deleteTimeEntry(event)
  return cors(405, { error: 'Method not allowed' })
}

/**
 * GET time entries
 * Query params:
 *   - employee_id: filter by specific employee
 *   - from: start date (YYYY-MM-DD)
 *   - to: end date (YYYY-MM-DD)
 *   - approved: filter by approval status (true/false)
 */
async function getTimeEntries(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    
    const employeeId = params.get('employee_id')
    const from = params.get('from')
    const to = params.get('to')
    const approvedParam = params.get('approved')

    // Simple approach: Get all entries for tenant, then filter in JavaScript if needed
    // This is less efficient but more reliable with Neon's tagged templates
    let allRows = await sql`
      SELECT 
        te.id, te.employee_id, e.name as employee_name,
        te.work_date, te.start_time, te.end_time, te.total_hours,
        te.approved, te.approved_by, te.approved_at, te.notes,
        te.created_at, te.updated_at
      FROM time_entries te
      JOIN employees e ON e.id = te.employee_id
      WHERE te.tenant_id = ${TENANT_ID}
      ORDER BY te.work_date DESC, e.name
    `

    // Apply filters in JavaScript
    let rows = allRows

    if (employeeId) {
      rows = rows.filter(row => row.employee_id === employeeId)
    }

    if (from) {
      rows = rows.filter(row => row.work_date >= from)
    }

    if (to) {
      rows = rows.filter(row => row.work_date <= to)
    }

    if (approvedParam !== null && approvedParam !== undefined) {
      const approvedValue = approvedParam === 'true'
      rows = rows.filter(row => row.approved === approvedValue)
    }

    return cors(200, rows)
  } catch (e) {
    console.error('getTimeEntries error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

/**
 * POST: Save time entry
 * Body: {
 *   employee_id: "uuid",
 *   work_date: "2025-01-15",
 *   start_time: "08:00",
 *   end_time: "17:00",
 *   notes: "Optional notes"
 * }
 */
async function saveTimeEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { employee_id, work_date, start_time, end_time, notes } = body

    // Validation
    if (!employee_id) {
      return cors(400, { error: 'employee_id is required' })
    }
    if (!work_date) {
      return cors(400, { error: 'work_date is required' })
    }
    if (!start_time || !end_time) {
      return cors(400, { error: 'Both start_time and end_time are required' })
    }

    // Check if entry already exists for this employee/date
    const existing = await sql`
      SELECT id, approved
      FROM time_entries
      WHERE tenant_id = ${TENANT_ID}
        AND employee_id = ${employee_id}
        AND work_date = ${work_date}
    `

    if (existing.length > 0) {
      // Update existing entry
      const entry = existing[0]
      
      // Don't allow editing approved entries (manager must unapprove first)
      if (entry.approved) {
        return cors(400, { error: 'Cannot edit approved time entry' })
      }

      await sql`
        UPDATE time_entries
        SET 
          start_time = ${start_time},
          end_time = ${end_time},
          notes = ${notes || null}
        WHERE id = ${entry.id}
      `

      return cors(200, { ok: true, updated: true, id: entry.id })
    } else {
      // Insert new entry
      const result = await sql`
        INSERT INTO time_entries (
          tenant_id, employee_id, work_date,
          start_time, end_time, notes
        )
        VALUES (
          ${TENANT_ID},
          ${employee_id},
          ${work_date},
          ${start_time},
          ${end_time},
          ${notes || null}
        )
        RETURNING id
      `

      return cors(200, { ok: true, created: true, id: result[0].id })
    }
  } catch (e) {
    console.error('saveTimeEntry error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

/**
 * DELETE: Remove time entry
 * Query params: id (entry ID)
 */
async function deleteTimeEntry(event) {
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

    // Check if entry is approved (can't delete approved entries)
    const entry = await sql`
      SELECT approved
      FROM time_entries
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    `

    if (entry.length === 0) {
      return cors(404, { error: 'Time entry not found' })
    }

    if (entry[0].approved) {
      return cors(400, { error: 'Cannot delete approved time entry' })
    }

    await sql`
      DELETE FROM time_entries
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    `

    return cors(200, { ok: true, deleted: id })
  } catch (e) {
    console.error('deleteTimeEntry error:', e)
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