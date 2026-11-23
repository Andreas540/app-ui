// netlify/functions/session-unlock.mjs
// Verifies a PIN against an existing authenticated session and issues a fresh JWT.
// Security rules:
//   - Valid (non-expired) JWT required. Expired JWT → 401 → client shows full login.
//   - Max 5 failed attempts before 15-minute lockout (server-side, DB-tracked).
//   - 300 ms artificial delay on every attempt to slow scripted guessing.
//   - Fresh JWT (sliding expiration) on success.

import bcrypt from 'bcryptjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'
import { signToken, verifyToken, extractBearer } from './utils/jwt.mjs'
import { logActivity } from './utils/activity-logger.mjs'

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const ATTEMPT_DELAY_MS = 300

export const handler = withErrorLogging('session-unlock', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  // Validate JWT — must be valid and non-expired.
  const rawToken = extractBearer(event.headers.authorization || event.headers.Authorization)
  if (!rawToken) return cors(401, { error: 'Authentication required' })

  let decoded
  try {
    decoded = verifyToken(rawToken)
  } catch (err) {
    const status = err.name === 'TokenExpiredError' ? 401 : 401
    return cors(status, { error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' })
  }

  const { userId, email } = decoded
  if (!userId) return cors(401, { error: 'Invalid token' })

  const body = JSON.parse(event.body || '{}')
  const { pin } = body
  if (!pin || typeof pin !== 'string') return cors(400, { error: 'PIN required' })

  const sql = neon(DATABASE_URL)

  const users = await sql`
    SELECT id, pin_hash, pin_failed_attempts, pin_locked_until
    FROM users
    WHERE id = ${userId}::uuid
    LIMIT 1
  `
  if (!users.length) return cors(401, { error: 'User not found' })
  const user = users[0]

  // Reject immediately if server-side lockout is active.
  if (user.pin_locked_until && new Date(user.pin_locked_until) > new Date()) {
    await logActivity({ sql, event, action: 'pin_lockout', success: false, userId, tenantId: null })
    return cors(423, { error: 'Account temporarily locked. Please log in again.' })
  }

  // A served lockout clears the count. Without this the counter only ever went
  // back to zero on a SUCCESSFUL unlock, so once someone reached five failures
  // the number stayed there: the lockout expired, and then the next single typo
  // — days later — took them straight back over the limit and locked them out
  // again for fifteen minutes. One bad evening made an account permanently
  // one-mistake-from-locked.
  let failedSoFar = Number(user.pin_failed_attempts) || 0
  if (user.pin_locked_until && new Date(user.pin_locked_until) <= new Date()) {
    failedSoFar = 0
    await sql`
      UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL
      WHERE id = ${userId}::uuid
    `
  }

  if (!user.pin_hash) return cors(400, { error: 'No PIN set for this account' })

  // Slow down brute-force attempts.
  await new Promise(resolve => setTimeout(resolve, ATTEMPT_DELAY_MS))

  const match = await bcrypt.compare(String(pin), user.pin_hash)

  if (!match) {
    const newAttempts = failedSoFar + 1
    // How long the submitted PIN was — never the PIN itself. If a rejection is
    // ever disputed, this says whether the page assembled a full code or sent
    // something short, which is the difference between a mistyped PIN and a
    // broken input. There is no way to work backwards from a length.
    const lengthNote = `submitted_length=${String(pin).length}`
    const locked = newAttempts >= MAX_ATTEMPTS

    if (locked) {
      await sql`
        UPDATE users
        SET pin_failed_attempts = ${newAttempts},
            pin_locked_until    = NOW() + ${`${LOCKOUT_MINUTES} minutes`}::interval
        WHERE id = ${userId}::uuid
      `
      await logActivity({ sql, event, action: 'pin_lockout', success: false, userId, tenantId: null, error: lengthNote })
      return cors(423, { error: 'Too many failed attempts. Session locked.' })
    }

    await sql`UPDATE users SET pin_failed_attempts = ${newAttempts} WHERE id = ${userId}::uuid`
    await logActivity({ sql, event, action: 'pin_failed_attempt', success: false, userId, tenantId: null, error: lengthNote })
    // 403, not 401. A wrong PIN is a rejected attempt by a caller whose session is
    // perfectly valid; 401 says the session itself is no good, and the overlay
    // acted on that literally — one wrong digit logged the person out to the login
    // screen with no message, and the "attempts remaining" text below was
    // unreachable. 401 is now reserved for an actually bad token.
    return cors(403, { error: 'Incorrect PIN', attempts_remaining: MAX_ATTEMPTS - newAttempts })
  }

  // Success — reset counters and issue a fresh JWT (sliding expiration).
  await sql`
    UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ${userId}::uuid
  `
  const freshToken = signToken({ userId, email })
  await logActivity({ sql, event, action: 'session_unlocked', success: true, userId, tenantId: null })

  return cors(200, { token: freshToken })
})

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    },
    body: JSON.stringify(body),
  }
}
