// netlify/functions/time-entries.mjs

import { checkMaintenance } from './utils/maintenance.mjs'
import { getAuthContext } from './utils/employee-auth.mjs'
import { nowInTz } from './utils/tz.mjs'
import { findCurrentShift } from './utils/current-shift.mjs'

export async function handler(event) {
  // 🔴 Add this check
  const check = checkMaintenance()
  if (check) return check
  if (event.httpMethod === 'OPTIONS') return cors(204, {}, event)
  if (event.httpMethod === 'GET') return getTimeEntries(event)
  if (event.httpMethod === 'POST') return saveTimeEntry(event)
  if (event.httpMethod === 'DELETE') return deleteTimeEntry(event)
  return cors(405, { error: 'Method not allowed' }, event)
}

/**
 * GET time entries
 */
async function getTimeEntries(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)
    const ctx = await getAuthContext({ sql, event })
    if (ctx.error) return cors(403, { error: ctx.error }, event)

    const TENANT_ID = ctx.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})

    if (ctx.mode === 'employee' && params.get('me') === 'true') {
      const emp = await sql`
        SELECT id, name, employee_code, active
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND id = ${ctx.employeeId}::uuid
        LIMIT 1
      `
      if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
      return cors(200, { employee: emp[0] }, event)
    }

    const employeeId = ctx.mode === 'employee' ? ctx.employeeId : params.get('employee_id') || null

    // Which employees the caller may not approve. Lives here rather than behind
    // tenant-admin so a non-admin approver can read their own list; the approve
    // endpoint enforces it regardless of what the UI does with this.
    if (params.get('my_exclusions') === 'true') {
      // Only meaningful for a logged-in app user; employees reporting via a token
      // never approve anything.
      if (ctx.mode !== 'app' || !ctx.userId) return cors(200, { employee_ids: [] }, event)
      const rows = await sql`
        SELECT employee_id::text AS employee_id
        FROM time_approval_exclusions
        WHERE tenant_id = ${ctx.tenantId} AND user_id = ${ctx.userId}::uuid
      `.catch(() => [])
      return cors(200, { employee_ids: rows.map(r => r.employee_id) }, event)
    }

    // Time Approval's starting sort (db/80, set in Tenant Admin > Employees > Other).
    // Read here rather than from tenant-admin so a non-admin approver can load it.
    // Before db/80 is applied the columns are missing: fall back to name, ascending.
    if (params.get('approval_sort') === 'true') {
      if (ctx.mode !== 'app') return cors(200, { sort: 'name', desc: false }, event)
      const rows = await sql`
        SELECT time_approval_sort AS sort, time_approval_sort_desc AS desc
        FROM tenants WHERE id = ${TENANT_ID}::uuid LIMIT 1
      `.catch(() => [])
      return cors(200, { sort: rows[0]?.sort || 'name', desc: rows[0]?.desc === true }, event)
    }

    // "Now", in the tenant's timezone, for the fixed-break window below. Only an
    // employee-mode caller has a timezone resolved; an app caller reads timesheets
    // for whatever date it asks about, where a live break window means nothing.
    const nowStamp = ctx.mode === 'employee' ? nowInTz(ctx.timezone) : null
    const nowDate = nowStamp?.date ?? null
    const nowTime = nowStamp?.time ?? null

    // The employee page asks for "my current shift" rather than "today's row": after
    // midnight, a shift clocked in yesterday is still the one being worked
    // (utils/current-shift.mjs). Also used below so the fixed-break window is read
    // on that shift, not on a today that has no row yet.
    let currentShiftId = null
    if (ctx.mode === 'employee') {
      const shift = await findCurrentShift({
        sql, tenantId: TENANT_ID, employeeId: ctx.employeeId, nowDate, nowTime,
      })
      currentShiftId = shift.entry?.id ?? null
      if (params.get('current') === 'true' && !currentShiftId) return cors(200, [], event)
    }
    const onlyId = params.get('current') === 'true' ? currentShiftId : null

    const from = onlyId ? null : params.get('from') || null
    const to = onlyId ? null : params.get('to') || null
    const approvedParam = params.get('approved')
    const approved = approvedParam === null || approvedParam === undefined ? null : approvedParam === 'true'

    const rows = await sql`
      SELECT
        te.id,
        te.employee_id,
        e.name as employee_name,
        te.work_date,
        to_char(te.start_time, 'HH24:MI') as start_time,
        to_char(te.end_time, 'HH24:MI') as end_time,
        te.total_hours::float8 as total_hours,
        te.salary::float8 as salary,
        -- Unpaid minutes already deducted from total_hours by the database
        -- (sync_time_entry_break_minutes -> calculate_time_entry_totals).
        COALESCE(te.break_minutes, 0) AS break_minutes,
        -- Set only while someone is away right now, so the page can show
        -- "on break since HH:MM" instead of guessing from the totals.
        (
          SELECT to_char(b.break_start, 'HH24:MI')
          FROM time_entry_breaks b
          WHERE b.tenant_id = te.tenant_id
            AND b.time_entry_id = te.id
            AND b.break_end IS NULL
            -- An entered break (db/78) has no break_end either, but nobody is away:
            -- it is a duration a manager recorded after the fact.
            AND b.duration_minutes IS NULL
          LIMIT 1
        ) AS on_break_since,
        -- When a FIXED break booked earlier runs out. A fixed break is stored
        -- already closed, with its end in the near future, so it is in force
        -- without ever being open — on_break_since above cannot see it. The page
        -- uses this to say "on break until HH:MM" and to stop a second tap
        -- booking a second deduction. NULL for every past day and for app callers.
        (
          SELECT to_char(b.break_end, 'HH24:MI')
          FROM time_entry_breaks b
          WHERE b.tenant_id = te.tenant_id
            AND b.time_entry_id = te.id
            AND b.break_end IS NOT NULL
            AND ${nowTime}::time IS NOT NULL
            AND (te.work_date = ${nowDate}::date OR te.id = ${currentShiftId}::uuid)
            AND CASE
                  WHEN b.break_end >= b.break_start
                    THEN ${nowTime}::time >= b.break_start AND ${nowTime}::time < b.break_end
                  -- Window crossing midnight, read the same way as the deduction
                  -- trigger reads it.
                  ELSE ${nowTime}::time >= b.break_start OR ${nowTime}::time < b.break_end
                END
          ORDER BY b.break_end DESC
          LIMIT 1
        ) AS on_break_until,
        te.approved,
        -- Live name where we know which account approved, so a rename shows
        -- through; the name captured at the time for rows predating that.
        COALESCE(au.name, te.approved_by) AS approved_by,
        te.approved_by_user_id,
        te.approved_at,
        te.notes,
        te.created_at,
        te.updated_at
      FROM time_entries te
      JOIN employees e ON e.id = te.employee_id
      LEFT JOIN users au ON au.id = te.approved_by_user_id
      WHERE te.tenant_id = ${TENANT_ID}
        AND (${employeeId}::uuid IS NULL OR te.employee_id = ${employeeId}::uuid)
        AND (${from}::date IS NULL OR te.work_date >= ${from}::date)
        AND (${to}::date IS NULL OR te.work_date <= ${to}::date)
        AND (${approved}::boolean IS NULL OR te.approved = ${approved}::boolean)
        AND (${onlyId}::uuid IS NULL OR te.id = ${onlyId}::uuid)
      ORDER BY te.work_date DESC, e.name
    `
    return cors(200, rows, event)
  } catch (e) {
    console.error('getTimeEntries error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * POST: Save time entry
 */
async function saveTimeEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)
    const ctx = await getAuthContext({ sql, event })
    if (ctx.error) return cors(403, { error: ctx.error }, event)

    const TENANT_ID = ctx.tenantId
    const body = JSON.parse(event.body || '{}')
    let { employee_id, work_date, start_time, end_time, notes } = body
    let nowStamp = null

    const effectiveEmployeeId = ctx.mode === 'employee' ? ctx.employeeId : employee_id

    // An employee clocking in or out does not get to say when. Their device clock was
    // the source of truth before and it is not trustworthy for payroll: a phone on
    // another timezone, or simply set wrong, produced hours that were then paid out.
    // The server stamps the date and time in the tenant's timezone instead.
    //
    // `action` is the explicit signal from the page. The older shape — send whichever
    // of start_time/end_time you mean — is still accepted so a cached copy of the page
    // keeps working; only the VALUE is replaced, never the intent.
    if (ctx.mode === 'employee') {
      nowStamp = nowInTz(ctx.timezone)
      const { date: tzDate, time: tzTime } = nowStamp
      const action =
        body.action === 'clock_in' || body.action === 'clock_out'
          ? body.action
          : (end_time ? 'clock_out' : 'clock_in')

      work_date = tzDate
      start_time = action === 'clock_in' ? tzTime : undefined
      end_time = action === 'clock_out' ? tzTime : undefined
    }

    if (!effectiveEmployeeId) return cors(400, { error: 'employee_id is required' }, event)
    if (!work_date) return cors(400, { error: 'work_date is required' }, event)

    // Allow partial time entries (only start_time OR only end_time OR both)
    if (!start_time && !end_time) {
      return cors(400, { error: 'At least start_time or end_time is required' }, event)
    }

    const emp = await sql`
      SELECT id, active
      FROM employees
      WHERE tenant_id = ${TENANT_ID} AND id = ${effectiveEmployeeId}::uuid
      LIMIT 1
    `
    if (emp.length === 0) return cors(404, { error: 'Employee not found' }, event)
    if (!emp[0].active) return cors(400, { error: 'Employee is inactive' }, event)

    // A shift carried past midnight. Clocking out closes it on its own date, so the
    // hours stay with the day the shift started. Clocking in is refused while it is
    // open: the employee is still on it, and a second open shift would leave the
    // next clock-out guessing which one to close. Past the overnight limit the
    // helper stops returning it, and both buttons behave as on any other day.
    if (ctx.mode === 'employee') {
      const shift = await findCurrentShift({
        sql, tenantId: TENANT_ID, employeeId: effectiveEmployeeId,
        nowDate: nowStamp.date, nowTime: nowStamp.time,
      })
      if (shift.overnight) {
        if (start_time !== undefined) {
          return cors(400, { error: 'SHIFT_STILL_OPEN', work_date: shift.entry.work_date }, event)
        }
        const entry = shift.entry
        if (entry.approved) return cors(400, { error: 'Cannot edit approved time entry' }, event)
        await closeShift({ sql, tenantId: TENANT_ID, entry, endTime: end_time })
        return cors(200, { ok: true, updated: true, overnight: true, id: entry.id }, event)
      }
    }

    const existing = await sql`
      SELECT id, approved, start_time, end_time, notes
      FROM time_entries
      WHERE tenant_id = ${TENANT_ID}
        AND employee_id = ${effectiveEmployeeId}::uuid
        AND work_date = ${work_date}::date
    `

    if (existing.length > 0) {
      const entry = existing[0]
      if (entry.approved) return cors(400, { error: 'Cannot edit approved time entry' }, event)

      const updatedStartTime = start_time !== undefined ? start_time : entry.start_time
      const updatedEndTime = end_time !== undefined ? end_time : entry.end_time
      const updatedNotes = notes !== undefined ? notes : entry.notes

      await closeShift({
        sql, tenantId: TENANT_ID, entry,
        startTime: updatedStartTime, endTime: updatedEndTime, notes: updatedNotes,
      })
      return cors(200, { ok: true, updated: true, id: entry.id }, event)
    }

    const result = await sql`
      INSERT INTO time_entries (
        tenant_id, employee_id, work_date,
        start_time, end_time, notes
      )
      VALUES (
        ${TENANT_ID},
        ${effectiveEmployeeId}::uuid,
        ${work_date}::date,
        ${start_time || null},
        ${end_time || null},
        ${notes || null}
      )
      RETURNING id
    `
    return cors(200, { ok: true, created: true, id: result[0].id }, event)
  } catch (e) {
    console.error('saveTimeEntry error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * Write a shift's times, closing any break still running at the clock-out moment.
 *
 * Someone who starts a break and then clocks out without coming back would
 * otherwise leave the break open forever — and an open break deducts nothing, so
 * they would be paid for the time they were away. Close it at the clock-out moment:
 * paid time then runs from clock-in to the start of that last break. Done BEFORE
 * the entry update so the break trigger's recalculation is not overwritten by it.
 *
 * Fields left undefined keep their stored value.
 */
async function closeShift({ sql, tenantId, entry, startTime, endTime, notes }) {
  const start = startTime !== undefined ? startTime : entry.start_time
  const end = endTime !== undefined ? endTime : entry.end_time
  const note = notes !== undefined ? notes : entry.notes

  if (end) {
    await sql`
      UPDATE time_entry_breaks
      SET break_end = ${end}, updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND time_entry_id = ${entry.id}
        AND break_end IS NULL
        -- Never an entered break (db/78): it has no break_end because none was
        -- measured, not because someone is still away. Stamping one here would
        -- turn a 30 minute lunch into a break running to the end of the shift.
        AND duration_minutes IS NULL
    `
  }

  await sql`
    UPDATE time_entries
    SET
      start_time = ${start},
      end_time = ${end},
      notes = ${note || null},
      updated_at = NOW()
    WHERE id = ${entry.id} AND tenant_id = ${tenantId}
  `
}

/**
 * DELETE: Remove time entry
 */
async function deleteTimeEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, event)

    const sql = neon(DATABASE_URL)
    const ctx = await getAuthContext({ sql, event })
    if (ctx.error) return cors(403, { error: ctx.error }, event)

    const TENANT_ID = ctx.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const id = params.get('id')
    if (!id) return cors(400, { error: 'id parameter is required' }, event)

    const entry = await sql`
      SELECT approved, employee_id
      FROM time_entries
      WHERE id = ${id}::uuid AND tenant_id = ${TENANT_ID}
      LIMIT 1
    `
    if (entry.length === 0) return cors(404, { error: 'Time entry not found' }, event)
    if (entry[0].approved) return cors(400, { error: 'Cannot delete approved time entry' }, event)

    if (ctx.mode === 'employee') {
      if (String(entry[0].employee_id) !== String(ctx.employeeId)) {
        return cors(403, { error: 'Not allowed' }, event)
      }
    }

    await sql`
      DELETE FROM time_entries
      WHERE id = ${id}::uuid AND tenant_id = ${TENANT_ID}
    `
    return cors(200, { ok: true, deleted: id }, event)
  } catch (e) {
    console.error('deleteTimeEntry error:', e)
    return cors(500, { error: String(e?.message || e) }, event)
  }
}

/**
 * CORS helper for cookie-based auth:
 * - must NOT use '*'
 * - must set allow-credentials
 * - must echo origin (or fall back to your own site)
 */
function cors(status, body, event) {
  const h = event?.headers || {}
  const origin = h.origin || h.Origin || ''

  // Never return '*' with credentials.
  // If Origin is missing, fall back to your own site.
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




