// src/lib/time.ts

// Return YYYY-MM-DD for "today" in the given IANA time zone.
// Uses Intl to avoid local-time / UTC drift.
export function todayYMD(tz: string = 'America/New_York'): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA gives YYYY-MM-DD reliably
  return fmt.format(new Date());
}

// Quick check for a YYYY-MM-DD literal (no time)
export function isYMD(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Format to US date with 2-digit year (MM/DD/YY).
// If input is YYYY-MM-DD, format without constructing Date (no TZ shift).
// If input is Date or other string, we fall back to Date safely.
export function formatUSAny(d: string | Date | undefined | null): string {
  if (!d) return '';
  if (typeof d === 'string' && isYMD(d)) {
    const [yyyy, mm, dd] = d.split('-');
    const yy = yyyy.slice(-2);
    return `${Number(mm)}/${Number(dd)}/${yy}`; // strip leading zeros
  }
  const dt = new Date(d as any);
  if (!Number.isNaN(dt.getTime())) {
    const mm = dt.getMonth() + 1;
    const dd = dt.getDate();
    const yy = String(dt.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  }
  return String(d);
}

// Optional: convert YYYY-MM-DD -> Date at local midnight (no timezone subtraction)
export function ymdToLocalDate(ymd: string): Date {
  if (!isYMD(ymd)) return new Date(ymd);
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}


