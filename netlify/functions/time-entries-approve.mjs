// netlify/functions/time-entries-approve.mjs
// Separate function for approval workflow to keep concerns separated

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return approveTimeEntry(event)
  return cors(405, { error: 'Method not allowed' })
}

/**
 * POST: Approve or unapprove a time entry
 * Body: {
 *   id: "uuid",
 *   approved: true/false,
 *   approved_by: "Manager Name" (required if approved=true)
 * }
 */
async function approveTimeEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { id, approved, approved_by } = body

    // Validation
    if (!id) {
      return cors(400, { error: 'id is required' })
    }
    
    if (approved === undefined || approved === null) {
      return cors(400, { error: 'approved (boolean) is required' })
    }

    // approved_by is no longer taken from the body — it is derived from the session
    // below. The field is still accepted and ignored so older clients keep working.

    // Verify entry exists and belongs to tenant
    const entry = await sql`
      SELECT id, employee_id
      FROM time_entries
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    `

    if (entry.length === 0) {
      return cors(404, { error: 'Time entry not found' })
    }

    // Enforced here, not only in the UI: the greyed-out button is a convenience,
    // this is the actual control. Applies to unapproving too, so an excluded
    // approver cannot reverse someone else's decision either.
    const blocked = await sql`
      SELECT 1 FROM time_approval_exclusions
      WHERE tenant_id   = ${TENANT_ID}
        AND user_id     = ${authz.actingUserId}::uuid
        AND employee_id = ${entry[0].employee_id}
      LIMIT 1
    `.catch(() => [])
    if (blocked.length > 0) {
      return cors(403, { error: 'TIME_APPROVAL_EXCLUDED' })
    }

    // Update approval status
    if (approved) {
      // Identity comes from the session, never the request body. approved_by keeps
      // the name as it stood at approval time; reads prefer the live name via
      // approved_by_user_id, so a later rename shows through.
      const [approver] = await sql`
        SELECT name FROM users WHERE id = ${authz.actingUserId}::uuid LIMIT 1
      `
      const approverName = approver?.name || null

      await sql`
        UPDATE time_entries
        SET
          approved = TRUE,
          approved_by = ${approverName},
          approved_by_user_id = ${authz.actingUserId}::uuid,
          approved_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
    } else {
      // Unapprove
      await sql`
        UPDATE time_entries
        SET
          approved = FALSE,
          approved_by = NULL,
          approved_by_user_id = NULL,
          approved_at = NULL
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
    }

    return cors(200, { ok: true, id, approved })
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
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}