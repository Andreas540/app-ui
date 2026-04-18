// netlify/functions/website-track.mjs
// Public endpoint — receives page-view / click events from biznizoptimizer.com.
// No user auth. Validates a shared secret and action format, then writes to
// user_activity_log with action prefixed "web_" so stats queries can isolate them.
import { neon } from '@neondatabase/serverless'

const ORIGIN_WHITELIST = ['https://biznizoptimizer.com', 'https://www.biznizoptimizer.com']
const ACTION_RE = /^[a-z][a-z0-9_]{1,48}$/   // lowercase letters, digits, underscores, 2–49 chars

function cors(status, body, origin) {
  const allowed = ORIGIN_WHITELIST.includes(origin) ? origin : ORIGIN_WHITELIST[0]
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': allowed,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-track-key',
      'vary': 'Origin',
    },
    body: JSON.stringify(body),
  }
}

export async function handler(event) {
  const origin = event.headers?.origin || ''

  if (event.httpMethod === 'OPTIONS') return cors(200, {}, origin)
  if (event.httpMethod !== 'POST')    return cors(405, { error: 'Method not allowed' }, origin)

  // Shared-secret validation
  const { WEBSITE_TRACK_SECRET } = process.env
  if (WEBSITE_TRACK_SECRET) {
    const key = event.headers?.['x-track-key'] || event.headers?.['X-Track-Key'] || ''
    if (key !== WEBSITE_TRACK_SECRET) return cors(401, { error: 'Unauthorized' }, origin)
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON' }, origin) }

  const { action } = body
  if (!action || typeof action !== 'string' || !ACTION_RE.test(action)) {
    return cors(400, { error: 'action must be lowercase letters/digits/underscores, 2–49 chars' }, origin)
  }

  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' }, origin)

  try {
    const sql = neon(DATABASE_URL)
    const ip  = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
             || event.headers?.['x-real-ip']
             || null
    const ua  = event.headers?.['user-agent'] || null

    await sql`
      INSERT INTO user_activity_log (action, endpoint, ip_address, user_agent, success, name)
      VALUES (
        ${'web_' + action},
        ${event.path || '/api/website-track'},
        ${ip},
        ${ua},
        true,
        'biznizoptimizer.com'
      )
    `
    return cors(200, { ok: true }, origin)
  } catch (e) {
    console.error('website-track error:', e)
    return cors(500, { error: 'Failed to log event' }, origin)
  }
}
