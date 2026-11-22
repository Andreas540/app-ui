// netlify/functions/utils/break-config.mjs
//
// Which break options a tenant offers its employees (db/76_break_options.sql).
//
// Read by employee-session (so the page knows which buttons to draw) and by
// time-entry-breaks (so the server refuses an option the tenant has turned off,
// whatever a cached copy of the page still shows). The page is never the gate.

/** Longest fixed break anyone could plausibly mean. Guards against a typo'd 3000. */
const MAX_FIXED_MINUTES = 720

/**
 * What a tenant gets when nothing is configured, or when the configuration cannot
 * be read. Identical to the page's behaviour before this feature: Start/End Break
 * works, no one-tap durations are offered.
 */
export function defaultBreakConfig() {
  return { flexible: true, fixed: [] }
}

/**
 * Postgres INTEGER[] -> number[].
 *
 * The driver normally hands back a real array, but a literal '{30,45}' is handled
 * too: this value decides whether a payroll deduction is allowed, so it is not the
 * place to assume one driver's parsing.
 */
function parseMinutes(value) {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value === 'string') {
    return value.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number)
  }
  return []
}

/** A tenants row (or an API payload) -> the shape everything else uses. */
export function normalizeBreakConfig(row) {
  const fixed = parseMinutes(row?.break_fixed_minutes ?? row?.fixed)
  const flexible = row?.break_flexible_enabled ?? row?.flexible

  return {
    // Only an explicit false turns it off, so a missing column reads as "on".
    flexible: flexible !== false,
    fixed: [...new Set(fixed.filter(m => Number.isInteger(m) && m > 0 && m <= MAX_FIXED_MINUTES))]
      .sort((a, b) => a - b),
  }
}

/**
 * The tenant's configuration, or the defaults.
 *
 * The query is allowed to fail: on a database where db/76 has not been applied the
 * columns do not exist, and an employee must not be locked out of clocking in over
 * a settings read. Falling back means that tenant keeps today's behaviour.
 */
export async function loadBreakConfig(sql, tenantId) {
  const rows = await sql`
    SELECT break_flexible_enabled, break_fixed_minutes
    FROM tenants
    WHERE id = ${tenantId}::uuid
    LIMIT 1
  `.catch(() => [])

  if (rows.length === 0) return defaultBreakConfig()
  return normalizeBreakConfig(rows[0])
}
