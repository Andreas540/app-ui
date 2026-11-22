// Shared JWT utility — single source of truth for signing and verifying tokens.
// Import this instead of duplicating jwt.sign/jwt.verify calls across functions.
import jwt from 'jsonwebtoken'

// One working day. The session ends here regardless of activity, so everyone
// logs in fresh each morning — and a stolen token is dead within the day.
//
// Not activity-based on purpose: activity is already handled by the 90-minute
// idle logout on the client (src/hooks/useIdleTimeout.ts). This is the absolute
// ceiling underneath it.
const DEFAULT_EXPIRY = '12h'

/**
 * Sign a JWT payload with the app secret.
 * @param {object} payload - Data to embed (userId, email, etc.)
 * @param {string} [expiresIn] - e.g. '12h', '15m'. Defaults to 12 hours.
 * @returns {string} Signed JWT string.
 */
export function signToken(payload, expiresIn = DEFAULT_EXPIRY) {
  const { JWT_SECRET } = process.env
  if (!JWT_SECRET) throw new Error('JWT_SECRET missing')
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

/**
 * Verify and decode a JWT string.
 * Throws jsonwebtoken errors on failure (TokenExpiredError, JsonWebTokenError, etc.)
 * @param {string} token
 * @returns {object} Decoded payload.
 */
export function verifyToken(token) {
  const { JWT_SECRET } = process.env
  if (!JWT_SECRET) throw new Error('JWT_SECRET missing')
  return jwt.verify(token, JWT_SECRET)
}

/**
 * Extract a raw token string from a Bearer Authorization header value.
 * Returns null if the header is missing or not a Bearer token.
 * @param {string|undefined} authHeader
 * @returns {string|null}
 */
export function extractBearer(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.substring(7)
}
