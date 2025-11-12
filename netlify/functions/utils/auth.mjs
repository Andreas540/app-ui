// netlify/functions/utils/auth.mjs
// Utility functions for authentication and authorization
import jwt from 'jsonwebtoken'

/**
 * Extract user info from JWT token in request headers
 * Returns user object or null if invalid/missing
 */
export function getUserFromToken(event) {
  try {
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) {
      console.error('JWT_SECRET not configured')
      return null
    }

    // Get token from Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader) {
      return null
    }

    // Extract token (format: "Bearer TOKEN")
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader

    // Verify and decode token
    const decoded = jwt.verify(token, JWT_SECRET)
    
    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
      accessLevel: decoded.accessLevel
    }
  } catch (err) {
    console.error('Token verification failed:', err.message)
    return null
  }
}

/**
 * Get tenant ID for the current request
 * Priority:
 * 1. From JWT token (new auth system)
 * 2. From TENANT_ID environment variable (legacy BLV)
 */
export function getTenantId(event) {
  // Try to get from JWT token first
  const user = getUserFromToken(event)
  if (user && user.tenantId) {
    return user.tenantId
  }

  // Fall back to environment variable (legacy BLV support)
  const { TENANT_ID } = process.env
  return TENANT_ID || null
}

/**
 * Check if user is a super admin
 */
export function isSuperAdmin(event) {
  const user = getUserFromToken(event)
  return user && user.role === 'super_admin'
}

/**
 * Require authentication - returns error response if not authenticated
 */
export function requireAuth(event) {
  const user = getUserFromToken(event)
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Authentication required' })
    }
  }
  return null // No error, user is authenticated
}

/**
 * Require specific role - returns error response if unauthorized
 */
export function requireRole(event, allowedRoles) {
  const user = getUserFromToken(event)
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Authentication required' })
    }
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Insufficient permissions' })
    }
  }

  return null // No error, user has required role
}