// src/lib/time.ts
// One place for all date handling across the app.

export const DEFAULT_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

/**
 * Return YYYY-MM-DD for "today" in the given IANA time zone.
 * Uses en-CA so the browser gives us ISO-like output.
 */
export function todayYMD(tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Convert a Date (or now) to YYYY-MM-DD in the given time zone.
 */
export function ymdInTZ(d: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
// Convert "YYYY-MM-DD" to "M/D/YYYY" (no TZ issues)
export function formatUS(ymd: string): string {
  if (!ymd) return '—'
  const base = ymd.includes('T') ? ymd.slice(0, 10) : ymd
  const [y, m, d] = base.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return `${m}/${d}/${y}`
}
