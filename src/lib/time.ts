// src/lib/time.ts

/**
 * Return YYYY-MM-DD for "today" in the given IANA time zone (e.g., 'America/New_York').
 * Uses en-CA so the browser gives us ISO-like output.
 */
export function todayYMD(tz?: string): string {
  const d = tz
    ? new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    : new Date();
  // en-CA -> YYYY-MM-DD; we still manually build to be explicit
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

  // Grab the first YYYY-MM-DD in the string (works for plain date or ISO timestamp)
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]); // 1..12
    const d = Number(m[3]);  // 1..31
    const yy = String(y % 100).padStart(2, '0');
    // No leading zeros for month/day
    return `${mo}/${d}/${yy}`;
  }

  // Fallback: try Date parsing (local) and format as M/D/YY
  const d = input instanceof Date ? input : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `${mo}/${day}/${yy}`;
}



