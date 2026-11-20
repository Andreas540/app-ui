// netlify/functions/time-entry-breaks.mjs
//
// Unpaid breaks inside a shift. One time_entries row per employee per day still
// holds the shift (clock in -> clock out); each break is a child row here, and the
// database keeps time_entries.break_minutes and total_hours in step via
// sync_time_entry_break_minutes (db/74_time_entry_breaks.sql).
//
// Deliberately a separate function from time-entries.mjs: breaks have their own
// lifecycle (start, end, list, remove) and mixing them into the single-row-per-day
// save logic there would make that function harder to reason about.
//
// Who may do what:
//   employee mode  start / end their own break, for today only, server-stamped
//   app mode       list and delete, so an admin can see and correct breaks
// Admin *editing* of break times is not built — see the note on handleDelete.

import { checkMaintenance } from './utils/maintenance.mjs'
import { getAuthContext } from './utils/employee-auth.mjs'
import { nowInTz } from './utils/tz.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

async function route(event) {
  const check = checkMaintenance()
  if (check) return check
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'GET') return listBreaks(event)
  if (event.httpMethod === 'POST') return postBreak(event)
  if (event.httpMethod === 'DELETE') return deleteBreak(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

export const handler = withErrorLogging('time_entry_breaks', route)

async function db() {
  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return null
  return neon(DATABASE_URL)
}

/**
 * GET ?time_entry_id=<uuid>      breaks for one entry
 * GET ?from=YYYY-MM-DD&to=...    breaks across a date range, for the caller's scope
 *
 * An employee always gets only their own rows regardless of what they ask for.
 */
async function listBreaks(event) {
  const sql = await db()
  if (!sql) return cors(500, { error: 'DATABASE_URL missing' }, event)

  const ctx = await getAuthContext({ sql, event })
  if (ctx.error) return cors(403, { error: ctx.error }, event)

  const params = new URLSearchParams(event.queryStringParameters || {})
  const timeEntryId = params.get('time_entry_id') || null
  const from = params.get('from') || null
  const to = params.get('to') || null
  const employeeId = ctx.mode === 'employee' ? ctx.employeeId : params.get('employee_id') || null

  const rows = await sql`
    SELECT
      b.id,
      b.time_entry_id,
      te.employee_id,
      te.work_date,
      to_char(b.break_start, 'HH24:MI') AS break_start,
      to_char(b.break_end,   'HH24:MI') AS break_end,
      b.created_at
    FROM time_entry_breaks b
    JOIN time_entries te
      ON te.id = b.time_entry_id AND te.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${ctx.tenantId}
      AND (${timeEntryId}::uuid IS NULL OR b.time_entry_id = ${timeEntryId}::uuid)
      AND (${employeeId}::uuid IS NULL OR te.employee_id = ${employeeId}::uuid)
      AND (${from}::date IS NULL OR te.work_date >= ${from}::date)
      AND (${to}::date   IS NULL OR te.work_date <= ${to}::date)
    ORDER BY te.work_date DESC, b.break_start
  `
  return cors(200, rows, event)
}

/**
 * POST { action: 'start' | 'end' }
 *
 * Employee mode only. The server decides what time it is, in the tenant's timezone —
 * the employee's device clock is not trusted for anything that reaches payroll.
 */
async function postBreak(event) {
  const sql = await db()
  if (!sql) return cors(500, { error: 'DATABASE_URL missing' }, event)

  const ctx = await getAuthContext({ sql, event })
  if (ctx.error) return cors(403, { error: ctx.error }, event)

  if (ctx.mode !== 'employee') {
    return cors(403, { error: 'Breaks are recorded from the employee time-entry page' }, event)
  }

  const body = JSON.parse(event.body || '{}')
  const action = body.action
  if (action !== 'start' && action !== 'end') {
    return cors(400, { error: "action must be 'start' or 'end'" }, event)
  }

  const { date: workDate, time: nowTime, tz } = nowInTz(ctx.timezone)

  // The shift this break belongs to. Breaks only ever attach to today's entry: a
  // break on a past day is a correction, which belongs in the admin timesheet, not here.
  const entries = await sql`
    SELECT id, approved, start_time, end_time
    FROM time_entries
    WHERE tenant_id = ${ctx.tenantId}
      AND employee_id = ${ctx.employeeId}::uuid
      AND work_date = ${workDate}::date
    LIMIT 1
  `
  if (entries.length === 0) {
    return cors(400, { error: 'NOT_CLOCKED_IN' }, event)
  }
  const entry = entries[0]

  if (entry.approved) return cors(400, { error: 'ENTRY_APPROVED' }, event)
  if (!entry.start_time) return cors(400, { error: 'NOT_CLOCKED_IN' }, event)
  // A break after clocking out would be unpaid time outside a paid shift, which
  // means nothing. Blocked rather than silently recorded.
  if (entry.end_time) return cors(400, { error: 'ALREADY_CLOCKED_OUT' }, event)

  const open = await sql`
    SELECT id, to_char(break_start, 'HH24:MI') AS break_start
    FROM time_entry_breaks
    WHERE tenant_id = ${ctx.tenantId} AND time_entry_id = ${entry.id} AND break_end IS NULL
    LIMIT 1
  `

  if (action === 'start') {
    // The partial unique index enforces this too; checking here turns a constraint
    // violation into an answer the page can show.
    if (open.length > 0) {
      return cors(400, { error: 'BREAK_ALREADY_OPEN', break_start: open[0].break_start }, event)
    }
    const inserted = await sql`
      INSERT INTO time_entry_breaks (tenant_id, time_entry_id, break_start)
      VALUES (${ctx.tenantId}, ${entry.id}, ${nowTime})
      RETURNING id
    `
    return cors(200, {
      ok: true, started: true, id: inserted[0].id, break_start: nowTime, timezone: tz,
    }, event)
  }

  if (open.length === 0) return cors(400, { error: 'NO_OPEN_BREAK' }, event)

  await sql`
    UPDATE time_entry_breaks
    SET break_end = ${nowTime}, updated_at = NOW()
    WHERE id = ${open[0].id} AND tenant_id = ${ctx.tenantId}
  `
  return cors(200, {
    ok: true, ended: true, id: open[0].id,
    break_start: open[0].break_start, break_end: nowTime, timezone: tz,
  }, event)
}

/**
 * DELETE ?id=<uuid>
 *
 * For an admin removing a break that should not be there. Editing a break's times is
 * not offered: the times are evidence of when someone was away, and a wrong one is
 * better removed and the shift corrected than quietly rewritten. If admins turn out to
 * need real editing, it belongs in the approval screen alongside start/end editing,
 * not here.
 */
async function deleteBreak(event) {
  const sql = await db()
  if (!sql) return cors(500, { error: 'DATABASE_URL missing' }, event)

  const ctx = await getAuthContext({ sql, event })
  if (ctx.error) return cors(403, { error: ctx.error }, event)

  const params = new URLSearchParams(event.queryStringParameters || {})
  const id = params.get('id')
  if (!id) return cors(400, { error: 'id parameter is required' }, event)

  const rows = await sql`
    SELECT b.id, te.approved, te.employee_id
    FROM time_entry_breaks b
    JOIN time_entries te ON te.id = b.time_entry_id AND te.tenant_id = b.tenant_id
    WHERE b.id = ${id}::uuid AND b.tenant_id = ${ctx.tenantId}
    LIMIT 1
  `
  if (rows.length === 0) return cors(404, { error: 'Break not found' }, event)
  // Same rule as the shift itself: once approved, the record stops moving.
  if (rows[0].approved) return cors(400, { error: 'Cannot change an approved time entry' }, event)

  if (ctx.mode === 'employee' && String(rows[0].employee_id) !== String(ctx.employeeId)) {
    return cors(403, { error: 'Not allowed' }, event)
  }

  await sql`
    DELETE FROM time_entry_breaks WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}
  `
  return cors(200, { ok: true, deleted: id }, event)
}

// Mirrors time-entries.mjs: cookie auth means no '*' origin and credentials allowed.
function cors(status, body, event) {
  const h = event?.headers || {}
  const origin = h.origin || h.Origin || ''
  const allowOrigin = origin || 'https://data-entry-beta.netlify.app'

  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': allowOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers':
        'content-type,authorization,x-tenant-id,x-active-tenant,x-employee-token',
      'access-control-max-age': '86400',
    },
    body: JSON.stringify(body),
  }
}
