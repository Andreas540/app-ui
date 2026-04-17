// src/lib/time.ts
import i18n from '../i18n/config'

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
export function formatLongDate(input: string | Date | undefined | null, locale: string = resolveLocale(i18n.language || 'en')): string {
  if (!input) return '';
  
  const date = typeof input === 'string' ? parseLocalDate(input) : input;
  
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Maps short i18n language codes to explicit BCP 47 regional tags so date
 * formatting is unambiguous. Full tags (e.g. 'en-GB' added in the future)
 * are passed through unchanged — no code change needed when new locales arrive.
 */
const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  es: 'es-419',
  sv: 'sv-SE',
}
export function resolveLocale(lang: string): string {
  if (lang.includes('-')) return lang          // already a full BCP 47 tag
  return LOCALE_MAP[lang] ?? lang
}

/**
 * Locale-aware compact date formatter. Uses the current i18n language so dates
 * display in the tenant's regional format (e.g. M/D/YY for en-US, D/M/YY for
 * es, YY-MM-DD for sv-SE, D/M/YY for en-GB). Parses YYYY-MM-DD strings as
 * local dates to avoid UTC shifts.
 */
export function formatDate(input: string | Date | undefined | null): string {
  if (!input) return '';
  const s = String(input);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : input instanceof Date ? input : new Date(s);
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString(resolveLocale(i18n.language || 'en'), {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });
}

/**
 * Format a date as "Apr '26" for chart axis labels, using i18n locale.
 */
export function formatMonthYear(input: string | Date | undefined | null): string {
  if (!input) return '';
  const s = String(input);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : input instanceof Date ? input : new Date(s);
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString(resolveLocale(i18n.language || 'en'), {
    month: 'short',
    year: '2-digit',
  });
}

/**
 * Format a date as "Apr 17" using i18n locale.
 */
export function formatShortMonthDay(input: string | Date | undefined | null): string {
  if (!input) return '';
  const s = String(input);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : input instanceof Date ? input : new Date(s);
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString(resolveLocale(i18n.language || 'en'), {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date as "Apr 17, 2026" using i18n locale.
 */
export function formatShortMonthDayYear(input: string | Date | undefined | null): string {
  if (!input) return '';
  const s = String(input);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : input instanceof Date ? input : new Date(s);
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString(resolveLocale(i18n.language || 'en'), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date+time using i18n locale.
 */
export function formatDateTime(input: string | Date | undefined | null): string {
  if (!input) return '';
  const s = String(input);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : input instanceof Date ? input : new Date(s);
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleString(resolveLocale(i18n.language || 'en'), {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
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



