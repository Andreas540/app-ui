// netlify/functions/website-stats.mjs
// Super-admin only. Returns 24-hour rolling website event data from biznizoptimizer.com.
// Reads rows with action LIKE 'web_%' from user_activity_log.
// Response format mirrors activity-stats.mjs so the frontend can reuse the same chart.
import jwt from 'jsonwebtoken'
import { neon } from '@neondatabase/serverless'

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    },
    body: JSON.stringify(body),
  }
}

function getUserIdFromToken(event) {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return null
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    return decoded.userId
  } catch { return null }
}

async function checkSuperAdmin(sql, userId) {
  try {
    const emails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    if (!emails.length) return false
    const rows = await sql`SELECT email FROM users WHERE id = ${userId}`
    return rows.length > 0 && emails.includes(rows[0].email.toLowerCase())
  } catch { return false }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod !== 'GET')     return cors(405, { error: 'Method not allowed' })

  const userId = getUserIdFromToken(event)
  if (!userId) return cors(401, { error: 'Authentication required' })

  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  const sql = neon(DATABASE_URL)
  if (!(await checkSuperAdmin(sql, userId))) return cors(403, { error: 'Super admin access required' })

  const windowStart      = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const windowStartIso   = windowStart.toISOString()
  const windowStartEpoch = Math.floor(windowStart.getTime() / 1000)

  try {
    const rows = await sql`
      SELECT
        GREATEST(0, LEAST(95,
          FLOOR((EXTRACT(EPOCH FROM timestamp) - ${windowStartEpoch}) / 900)
        ))::int AS bucket_index,
        action,
        COUNT(*)::int AS count
      FROM user_activity_log
      WHERE
        timestamp >= NOW() - INTERVAL '24 hours'
        AND action LIKE 'web_%'
        AND name = 'biznizoptimizer.com'
      GROUP BY 1, 2
      ORDER BY 1
    `

    const total = rows.reduce((s, r) => s + Number(r.count), 0)
    const entity = {
      id: 'website',
      name: 'biznizoptimizer.com',
      total,
      rows: rows.map(r => ({
        bucket_index: Number(r.bucket_index),
        action: r.action,
        count: Number(r.count),
      })),
    }

    return cors(200, {
      view: 'website',
      window_start: windowStartIso,
      tz: 'UTC',
      entities: [entity],
    })
  } catch (e) {
    console.error('website-stats error:', e)
    return cors(500, { error: 'Failed to fetch website stats', detail: e?.message || String(e) })
  }
}
