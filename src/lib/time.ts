// src/lib/time.ts

/**
 * Return YYYY-MM-DD for "today" in the given IANA time zone (e.g., 'America/New_York').
 * Uses en-CA so the browser gives us ISO-like output.
 */
export function todayYMD(tz?: string): string {
  const d = tz
    ? new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string as a local date (NOT UTC).
 * This prevents the common timezone shift bug where "2025-01-15" 
 * becomes Jan 14th in negative UTC offset timezones.
 */
export function parseLocalDate(dateStr: string): Date {
  const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(dateStr); // fallback
  
  const year = Number(m[1]);
  const month = Number(m[2]) - 1; // JS months are 0-indexed
  const day = Number(m[3]);
  
  return new Date(year, month, day);
}

/**
 * Format a YYYY-MM-DD date string (or any date) as "Mon, Jan 15" format.
 * Avoids timezone shifts by parsing as local date.
 */
export function formatLongDate(input: string | Date | undefined | null, locale: string = 'en-US'): string {
  if (!input) return '';
  
  const date = typeof input === 'string' ? parseLocalDate(input) : input;
  
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format anything that contains a date into US M/D/YY **without timezone shifts**.
 * - If `input` is like "2025-09-23" or "2025-09-23T00:00:00.000Z", we take the **first 10 chars**,
 *   parse as Y-M-D, and render "9/23/25".
 * - If it doesn't contain YYYY-MM-DD, we fall back to Date parsing and local-format it.
 */
export function formatUSAny(input: string | Date | undefined | null): string {
  if (!input) return '';
  const s = String(input);

  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const yy = String(y % 100).padStart(2, '0');
    return `${mo}/${d}/${yy}`;
  }

  const d = input instanceof Date ? input : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `${mo}/${day}/${yy}`;
}



