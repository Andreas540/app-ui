// netlify/functions/utils/current-shift.mjs
//
// Which shift an employee is "in" right now. One rule, shared by clock-in, clock-out,
// breaks and the employee page, so they can never disagree about it.
//
// A shift belongs to the date it was clocked in on. A shift that runs past midnight
// is stored on that date with end_time < start_time, which is how the database has
// always read an overnight pair (calculate_time_entry_totals adds 24 hours).
//
// The current shift is, in order:
//   1. today's entry, if it is open (clocked in, not out)
//   2. yesterday's entry, if it is open and was clocked in less than
//      OVERNIGHT_LIMIT_MINUTES ago — someone working through the night
//   3. today's entry, whatever its state (finished, or not there at all)
//
// Past the limit, yesterday's open entry is treated as a forgotten clock-out: it is
// left exactly as it is, with no end time, for a manager to correct, and the
// employee starts a fresh shift today.

export const OVERNIGHT_LIMIT_MINUTES = 20 * 60

/** 'HH:MM' or 'HH:MM:SS' -> minutes since midnight, or null. */
function toMinutes(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/** 'YYYY-MM-DD' minus one day, without touching timezones. */
function previousDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {object} args
 * @param {Function} args.sql   neon client
 * @param {string} args.tenantId
 * @param {string} args.employeeId
 * @param {string} args.nowDate  'YYYY-MM-DD' in the business timezone
 * @param {string} args.nowTime  'HH:MM' in the business timezone
 * @returns {Promise<{ entry: object|null, today: object|null, overnight: boolean }>}
 *   entry      the current shift per the rule above, or null
 *   today      today's entry, if any (clock-in needs it separately)
 *   overnight  true when entry is yesterday's shift carried past midnight
 */
export async function findCurrentShift({ sql, tenantId, employeeId, nowDate, nowTime }) {
  const yesterday = previousDay(nowDate)
  const rows = await sql`
    SELECT id, work_date::text AS work_date, approved, start_time, end_time, notes
    FROM time_entries
    WHERE tenant_id = ${tenantId}
      AND employee_id = ${employeeId}::uuid
      AND work_date IN (${nowDate}::date, ${yesterday}::date)
  `
  const today = rows.find(r => r.work_date === nowDate) || null
  const prev = rows.find(r => r.work_date === yesterday) || null
  const isOpen = r => r && r.start_time && !r.end_time

  if (isOpen(today)) return { entry: today, today, overnight: false }

  if (isOpen(prev)) {
    const start = toMinutes(prev.start_time)
    const now = toMinutes(nowTime)
    if (start !== null && now !== null && (1440 - start) + now < OVERNIGHT_LIMIT_MINUTES) {
      return { entry: prev, today, overnight: true }
    }
  }

  return { entry: today, today, overnight: false }
}
