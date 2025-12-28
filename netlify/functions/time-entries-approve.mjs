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

    if (approved && !approved_by) {
      return cors(400, { error: 'approved_by is required when approving' })
    }

    // Verify entry exists and belongs to tenant
    const entry = await sql`
      SELECT id
      FROM time_entries
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    `

    if (entry.length === 0) {
      return cors(404, { error: 'Time entry not found' })
    }

    // Update approval status
    if (approved) {
      await sql`
        UPDATE time_entries
        SET 
          approved = TRUE,
          approved_by = ${approved_by},
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