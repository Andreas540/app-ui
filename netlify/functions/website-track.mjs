// netlify/functions/website-track.mjs
// Public endpoint — receives page-view / click events from biznizoptimizer.com.
// No user auth. Validates a shared secret and action format, then writes to
// user_activity_log with action prefixed "web_" so stats queries can isolate them.
import { neon } from '@neondatabase/serverless'

const ACTION_RE = /^[a-z][a-z0-9_]{1,48}$/   // lowercase letters, digits, underscores, 2–49 chars

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-track-key',
    },
    body: JSON.stringify(body),
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod !== 'POST')    return cors(405, { error: 'Method not allowed' })

  // Shared-secret validation
  const { WEBSITE_TRACK_SECRET } = process.env
  if (WEBSITE_TRACK_SECRET) {
    const key = event.headers?.['x-track-key'] || event.headers?.['X-Track-Key'] || ''
    if (key !== WEBSITE_TRACK_SECRET) return cors(401, { error: 'Unauthorized' })
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON' }) }

  const { action } = body
  if (!action || typeof action !== 'string' || !ACTION_RE.test(action)) {
    return cors(400, { error: 'action must be lowercase letters/digits/underscores, 2–49 chars' })
  }

  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  try {
    const sql = neon(DATABASE_URL)
    const ip  = event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
             || event.headers?.['x-real-ip']
             || null
    const ua  = event.headers?.['user-agent'] || ''

    // Parse device/browser/os — these columns are likely NOT NULL in user_activity_log
    let device_type = 'desktop'
    if (/ipad/i.test(ua))                              device_type = 'tablet'
    else if (/mobile|android|iphone|ipod/i.test(ua))  device_type = 'mobile'

    let browser = 'unknown'
    if (/chrome/i.test(ua) && !/edge|edg/i.test(ua))  browser = 'Chrome'
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'
    else if (/firefox/i.test(ua))                       browser = 'Firefox'
    else if (/edge|edg/i.test(ua))                      browser = 'Edge'

    let os = 'unknown'
    if (/windows/i.test(ua))           os = 'Windows'
    else if (/mac/i.test(ua))          os = 'macOS'
    else if (/android/i.test(ua))      os = 'Android'
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
    else if (/linux/i.test(ua))        os = 'Linux'

    await sql`
      INSERT INTO user_activity_log
        (action, endpoint, ip_address, user_agent, device_type, browser, os, success, name)
      VALUES (
        ${'web_' + action},
        '/api/website-track',
        ${ip},
        ${ua},
        ${device_type},
        ${browser},
        ${os},
        true,
        'biznizoptimizer.com'
      )
    `
    return cors(200, { ok: true })
  } catch (e) {
    console.error('website-track error:', e)
    return cors(500, { error: 'Failed to log event', detail: e?.message })
  }
}
