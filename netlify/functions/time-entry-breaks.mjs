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
// Two kinds of break, both ending up as rows in this one table:
//
//   flexible  start -> end. break_end is NULL while the employee is away.
//   fixed     one tap books a set length (30 min). Written already closed, with
//             break_end in the near future, so there is nothing to come back from
//             and the deduction applies immediately.
//
// Which kinds a tenant offers is configuration (db/76_break_options.sql), checked
// here on every POST — the page is not the gate.
//
// Who may do what:
//   employee mode  start / end / fixed, for today only, server-stamped
//   app mode       list and delete, so an admin can see and correct breaks
// Admin *editing* of break times is not built — see the note on handleDelete.

import { checkMaintenance } from './utils/maintenance.mjs'
import { getAuthContext } from './utils/employee-auth.mjs'
import { loadBreakConfig } from './utils/break-config.mjs'
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
 * POST { action: 'start' | 'end' }                  flexible break
 * POST { action: 'fixed', minutes: 30 }             one-tap break of a set length
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
  if (action !== 'start' && action !== 'end' && action !== 'fixed') {
    return cors(400, { error: "action must be 'start', 'end' or 'fixed'" }, event)
  }

  const config = await loadBreakConfig(sql, ctx.tenantId)

  // Starting a break has to be allowed by the tenant's settings. ENDING one never
  // does: if flexible breaks are switched off while somebody is away, they must
  // still be able to come back. Otherwise their only way out is clocking out,
  // which closes the break at the clock-out moment and pays them to the start of
  // it — losing the rest of their shift.
  if (action === 'start' && !config.flexible) {
    return cors(400, { error: 'BREAK_OPTION_DISABLED' }, event)
  }

  let fixedMinutes = null
  if (action === 'fixed') {
    fixedMinutes = Number(body.minutes)
    // Only a duration the tenant actually offers. This is the whole protection
    // against a crafted request booking an eight-hour break.
    if (!config.fixed.includes(fixedMinutes)) {
      return cors(400, { error: 'BREAK_OPTION_DISABLED' }, event)
    }
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

  const existing = await sql`
    SELECT
      id,
      to_char(break_start, 'HH24:MI') AS break_start,
      to_char(break_end,   'HH24:MI') AS break_end
    FROM time_entry_breaks
    WHERE tenant_id = ${ctx.tenantId} AND time_entry_id = ${entry.id}
  `
  const open = existing.filter(b => b.break_end === null)
  // A fixed break books a window that runs into the future, so unlike a flexible
  // one it can still be in force while already closed. Tapping again inside that
  // window — the obvious double-tap — would book a second one and deduct twice.
  const covering = existing.filter(b => b.break_end !== null && coversTime(b, nowTime))

  if (action === 'end') {
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

  // Both ways of starting a break refuse while one is already running. The partial
  // unique index enforces the open-break case too; checking here turns a constraint
  // violation into an answer the page can show.
  if (open.length > 0) {
    return cors(400, { error: 'BREAK_ALREADY_OPEN', break_start: open[0].break_start }, event)
  }
  if (covering.length > 0) {
    // At most one: the two checks above are the only way a break is ever created,
    // and both refuse while another is in force.
    return cors(400, { error: 'BREAK_IN_PROGRESS', break_end: covering[0].break_end }, event)
  }

  if (action === 'start') {
    const inserted = await sql`
      INSERT INTO time_entry_breaks (tenant_id, time_entry_id, break_start)
      VALUES (${ctx.tenantId}, ${entry.id}, ${nowTime})
      RETURNING id
    `
    return cors(200, {
      ok: true, started: true, id: inserted[0].id, break_start: nowTime, timezone: tz,
    }, event)
  }

  // Fixed: inserted with both ends set, so the deduction is live at once rather
  // than waiting for a second tap that is never coming. A window that runs past
  // midnight is stored as-is (break_end < break_start) — the deduction trigger and
  // coversTime below both already read that as spanning midnight.
  const breakEnd = addMinutes(nowTime, fixedMinutes)
  const inserted = await sql`
    INSERT INTO time_entry_breaks (tenant_id, time_entry_id, break_start, break_end)
    VALUES (${ctx.tenantId}, ${entry.id}, ${nowTime}, ${breakEnd})
    RETURNING id
  `
  return cors(200, {
    ok: true, fixed: true, id: inserted[0].id,
    break_start: nowTime, break_end: breakEnd, minutes: fixedMinutes, timezone: tz,
  }, event)
}

/** 'HH:MM' + minutes, wrapping at midnight. */
function addMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Is `now` inside this closed break? Zero-padded 'HH:MM' compares correctly as a
 * string, so no date arithmetic is needed. break_end < break_start means the window
 * crosses midnight, matching how the deduction trigger reads the same pair.
 *
 * The end is exclusive: a break ending at 12:30 is over at 12:30, and another one
 * may start then.
 */
function coversTime(b, now) {
  if (!b.break_end) return false
  if (b.break_end >= b.break_start) return now >= b.break_start && now < b.break_end
  return now >= b.break_start || now < b.break_end
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
