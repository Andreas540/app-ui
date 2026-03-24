// netlify/functions/activity-stats.mjs
// Returns 24-hour rolling activity data for the Stats & Logs page (super_admin only).
// Global view  (no tenant_id param): one group per tenant.
// Tenant view  (tenant_id param):    one group per user within that tenant.
// Excludes 'verify_token' (fires on every page load, would drown real activity).
// Buckets: 96 × 15-minute slots covering the last 24 hours.
import jwt from 'jsonwebtoken'
import { neon } from '@neondatabase/serverless'

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}

function getUserIdFromToken(event) {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return null
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return null
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded.userId
  } catch {
    return null
  }
}

async function checkSuperAdmin(sql, userId) {
  try {
    const emails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    if (!emails.length) return false
    const rows = await sql`SELECT email FROM users WHERE id = ${userId}`
    if (!rows.length) return false
    return emails.includes(rows[0].email.toLowerCase())
  } catch {
    return false
  }
}

// Group flat SQL rows into per-entity maps
function groupRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = row.entity_id
    if (!map.has(key)) {
      map.set(key, { id: key, name: row.entity_name, total: 0, rows: [] })
    }
    const entity = map.get(key)
    entity.total += Number(row.count)
    entity.rows.push({
      bucket_index: Number(row.bucket_index),
      action: row.action,
      count: Number(row.count),
    })
  }
  return Array.from(map.values())
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  const userId = getUserIdFromToken(event)
  if (!userId) return cors(401, { error: 'Authentication required' })

  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)
  if (!(await checkSuperAdmin(sql, userId))) return cors(403, { error: 'Super admin access required' })

  const url = new URL(event.rawUrl || `http://x${event.path}`)
  const tenantId = url.searchParams.get('tenant_id') || null

  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const windowStartIso = windowStart.toISOString()
  const windowStartEpoch = Math.floor(windowStart.getTime() / 1000)

  try {
    if (!tenantId) {
      // ── Global view: group by tenant ──────────────────────────────────────
      const rows = await sql`
        SELECT
          GREATEST(0, LEAST(95,
            FLOOR((EXTRACT(EPOCH FROM timestamp) - ${windowStartEpoch}) / 900)
          ))::int                                        AS bucket_index,
          action,
          COALESCE(tenant_id::text, 'system')           AS entity_id,
          COALESCE(tenant_name, 'No tenant')            AS entity_name,
          COUNT(*)::int                                  AS count
        FROM user_activity_log
        WHERE
          timestamp >= NOW() - INTERVAL '24 hours'
          AND action NOT IN ('verify_token')
        GROUP BY 1, 2, 3, 4
        ORDER BY 4, 1
      `

      return cors(200, {
        view: 'global',
        window_start: windowStartIso,
        tz: 'America/New_York',
        entities: groupRows(rows),
      })
    } else {
      // ── Tenant view: group by user ────────────────────────────────────────
      const tenantRows = await sql`
        SELECT default_timezone FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
      `
      const tz = tenantRows[0]?.default_timezone || 'UTC'

      const rows = await sql`
        SELECT
          GREATEST(0, LEAST(95,
            FLOOR((EXTRACT(EPOCH FROM timestamp) - ${windowStartEpoch}) / 900)
          ))::int                                        AS bucket_index,
          action,
          COALESCE(user_id::text, 'system')             AS entity_id,
          COALESCE(name, email, 'Unknown user')         AS entity_name,
          COUNT(*)::int                                  AS count
        FROM user_activity_log
        WHERE
          timestamp >= NOW() - INTERVAL '24 hours'
          AND tenant_id = ${tenantId}::uuid
          AND action NOT IN ('verify_token')
        GROUP BY 1, 2, 3, 4
        ORDER BY 4, 1
      `

      return cors(200, {
        view: 'tenant',
        window_start: windowStartIso,
        tz,
        entities: groupRows(rows),
      })
    }
  } catch (e) {
    console.error('activity-stats error:', e)
    return cors(500, { error: 'Failed to fetch activity stats', detail: e?.message || String(e) })
  }
}
