// netlify/functions/utils/tz.mjs
// Timezone conversion shared by the booking paths. Previously this lived as four
// near-identical copies (public-booking, create-booking, sync-booking-provider,
// scheduled-sync-bookings), all carrying the same DST bug.

/**
 * Turn a wall-clock string ("2026-03-08 15:30" or "2026-03-08T15:30") read in `tz`
 * into the UTC instant it refers to.
 *
 * Two passes, and the second one is the point. The offset is probed by formatting a
 * candidate instant in `tz` and measuring the difference — but on a DST transition day
 * the offset at the *approximate* instant is not the offset at the *real* one, so a
 * single pass lands an hour out for every time after the switch:
 *
 *   '2026-03-08 03:30' America/New_York
 *     one pass  -> 08:30Z, which reads back as 04:30 New York  (one hour late)
 *     two pass  -> 07:30Z, which reads back as 03:30 New York  (correct)
 *
 * The second pass re-probes at the first pass's result, where the offset is the real one.
 *
 * Edge case with no right answer: a clock time inside the spring-forward gap (02:30 on a
 * day that jumps 02:00 -> 03:00) never existed. It resolves to 01:30 rather than throwing.
 * Ambiguous times in the fall-back hour resolve to the first (pre-transition) occurrence.
 */
export function localToUtc(localStr, tz) {
  if (!localStr || !String(localStr).trim()) return null
  const approxUtc = new Date(String(localStr).trim().replace(' ', 'T') + 'Z')
  if (isNaN(approxUtc.getTime())) return null
  if (!tz || tz === 'UTC') return approxUtc

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  const offsetAt = (instant) => {
    const p = Object.fromEntries(fmt.formatToParts(instant).map(x => [x.type, x.value]))
    const h = p.hour === '24' ? '00' : p.hour
    const asUtc = new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`)
    return asUtc.getTime() - instant.getTime()
  }

  const firstPass = new Date(approxUtc.getTime() - offsetAt(approxUtc))
  return new Date(approxUtc.getTime() - offsetAt(firstPass))
}

/**
 * Used when a tenant has no default_timezone set. Deliberately the same literal the
 * payroll triggers in the database already assume (calculate_time_entry_totals and
 * the salary-history lookup both hardcode it), so a tenant with no setting behaves
 * one way rather than two. Both should move together when the hardcoded-EST work
 * happens — grep for this constant and for 'America/New_York' in db/.
 */
export const FALLBACK_TZ = 'America/New_York'

/**
 * The current wall-clock date and time in `tz`, as the strings the time_entries
 * columns want: work_date (DATE) and start_time/end_time (TIME without zone).
 *
 * Why the server does this at all: the external time-entry page used to stamp clock
 * times from the employee's own device (`new Date().getHours()`). A phone set to
 * another timezone — or simply set wrong — recorded hours that payroll then paid out.
 * For an employee-mode request the server is the only trustworthy clock, so it is
 * the one that decides "now".
 *
 * en-CA gives YYYY-MM-DD directly, which is the same trick used at the fetch
 * boundary elsewhere in the app.
 */
export function nowInTz(tz) {
  const zone = tz || FALLBACK_TZ
  const now = new Date()
  const date = now.toLocaleDateString('en-CA', { timeZone: zone })
  let time = now.toLocaleTimeString('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // Some ICU builds render midnight as '24:00' under hour12:false, which Postgres
  // would reject for a TIME column. localToUtc above guards the same case.
  if (time.startsWith('24:')) time = '00:' + time.slice(3)
  return { date, time, tz: zone }
}
