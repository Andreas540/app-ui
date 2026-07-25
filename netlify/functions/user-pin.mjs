// netlify/functions/user-pin.mjs
// Set, change, or remove a user's PIN.
// Requires: valid JWT + correct account password (so an unattended terminal
// cannot be used to set a PIN and own the session).

import bcrypt from 'bcryptjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'
import { verifyToken, extractBearer } from './utils/jwt.mjs'
import { logActivity } from './utils/activity-logger.mjs'

export const handler = withErrorLogging('user-pin', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  const { neon } = await import('@neondatabase/serverless')
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

  // Validate JWT.
  const rawToken = extractBearer(event.headers.authorization || event.headers.Authorization)
  if (!rawToken) return cors(401, { error: 'Authentication required' })

  let decoded
  try {
    decoded = verifyToken(rawToken)
  } catch {
    return cors(401, { error: 'Invalid or expired token' })
  }

  const { userId } = decoded
  if (!userId) return cors(401, { error: 'Invalid token' })

  const body = JSON.parse(event.body || '{}')
  const { password, new_pin } = body

  if (!password || typeof password !== 'string') return cors(400, { error: 'Password required' })

  const sql = neon(DATABASE_URL)

  // Load user + tenant PIN settings in one query.
  const users = await sql`
    SELECT u.id, u.password_hash, u.tenant_id,
           COALESCE(t.pin_lock_enabled, false) AS pin_lock_enabled,
           COALESCE(t.pin_length, 6)            AS pin_length
    FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ${userId}::uuid
    LIMIT 1
  `
  if (!users.length) return cors(401, { error: 'User not found' })
  const user = users[0]

  // Verify account password — gate for all PIN operations.
  const passwordMatch = await bcrypt.compare(password, user.password_hash)
  if (!passwordMatch) return cors(403, { error: 'Incorrect password' })

  const tenantId = user.tenant_id

  // new_pin === null → clear PIN (only allowed when PIN lock is disabled for tenant).
  if (new_pin === null) {
    if (user.pin_lock_enabled) {
      return cors(400, { error: 'Cannot remove PIN while PIN lock is enabled for your organization' })
    }
    await sql`UPDATE users SET pin_hash = NULL, pin_set_at = NULL WHERE id = ${userId}::uuid`
    await logActivity({ sql, event, action: 'pin_cleared', success: true, userId, tenantId })
    return cors(200, { ok: true, user_has_pin: false })
  }

  // Validate new PIN format.
  if (typeof new_pin !== 'string' || !new_pin) return cors(400, { error: 'new_pin required' })
  if (!/^\d+$/.test(new_pin)) return cors(400, { error: 'PIN must contain digits only' })
  const requiredLength = Number(user.pin_length)
  if (new_pin.length !== requiredLength) {
    return cors(400, { error: `PIN must be exactly ${requiredLength} digits` })
  }

  const pinHash = await bcrypt.hash(new_pin, 10)
  await sql`
    UPDATE users
    SET pin_hash            = ${pinHash},
        pin_set_at          = NOW(),
        pin_failed_attempts = 0,
        pin_locked_until    = NULL
    WHERE id = ${userId}::uuid
  `
  await logActivity({ sql, event, action: 'pin_set', success: true, userId, tenantId })
  return cors(200, { ok: true, user_has_pin: true })
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
