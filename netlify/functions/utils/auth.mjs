// netlify/functions/utils/auth.mjs
// Utility functions for authentication and authorization
import jwt from 'jsonwebtoken'

const BLOCKED_EMAILS = new Set(['blvpcnd@gmail.com'])

/**
 * Extract user identity from JWT token in request headers
 * Returns { userId, email } or null if invalid/missing
 *
 * MIGRATION RULE:
 * - Do NOT trust tenantId/role/accessLevel from the JWT for authorization.
 * - JWT is identity only; authorization is resolved via DB in resolveAuthz().
 */
export function getUserFromToken(event) {
  try {
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) {
      console.error('JWT_SECRET not configured')
      return null
    }

    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader) return null

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader

    const decoded = jwt.verify(token, JWT_SECRET)

    // Identity only (source of truth for authz is DB)
    return {
      userId: decoded.userId,
      email: decoded.email
    }
  } catch (err) {
    console.error('Token verification failed:', err.message)
    return null
  }
}

/**
 * LEGACY (migration-safe):
 * Returns tenant id from environment only.
 *
 * Why:
 * - Keeps BLV working if some endpoints aren't migrated yet.
 * - Prevents accidental trust of JWT tenantId (which could cause leakage).
 *
 * New code should use:
 *   const authz = await resolveAuthz({ sql, event })
 *   const TENANT_ID = authz.tenantId
 */
export function getTenantId(event) {
  const { TENANT_ID } = process.env
  return TENANT_ID || null
}

/**
 * Check if user is SuperAdmin based on email in SUPER_ADMIN_EMAILS env var
 */
export function isSuperAdmin(event) {
  const user = getUserFromToken(event)
  if (!user?.email) return false

  const { SUPER_ADMIN_EMAILS } = process.env
  if (!SUPER_ADMIN_EMAILS) return false

  const adminEmails = SUPER_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
  const userEmailLower = user.email.toLowerCase().trim()
  
  return adminEmails.includes(userEmailLower)
}

/**
 * DEPRECATED during migration:
 * Do not trust roles from JWT.
 * Migrate role checks to DB using resolveAuthz().
 *
 * If you currently use this in production, do NOT rely on it for security.
 */
export function requireRole(event, allowedRoles) {
  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'requireRole not migrated; use resolveAuthz() role checks' })
  }
}

/**
 * Require authentication - returns error response if not authenticated
 * (Identity check only)
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
  return null
}

/**
 * Resolve tenant + role + features from DB memberships (source of truth).
 * - JWT is used only to identify userId
 * - tenant/role/features are loaded from DB
 * - tenantFeatures: what the tenant has enabled
 * - userFeatures: what this specific user can access (null = all tenant features)
 * - SuperAdmins have access without tenant membership
 */
export async function resolveAuthz({ sql, event }) {
  const { TENANT_ID } = process.env
  if (!TENANT_ID) return { error: 'TENANT_ID missing' }

  const user = getUserFromToken(event)

  // No/invalid token => preserve current BLV behavior for now
  if (!user?.userId) {
    return { tenantId: TENANT_ID, role: 'tenant_admin', tenantFeatures: [], userFeatures: null, mode: 'fallback' }
  }

  // Optional immediate hard-block by email (only affects emails in BLOCKED_EMAILS)
  const emailNorm = (user.email || '').toLowerCase().trim()
  if (emailNorm && BLOCKED_EMAILS.has(emailNorm)) {
    return { error: 'ACCOUNT_DISABLED' }
  }

  const requestedTenantId =
    event.headers['x-tenant-id'] ||
    event.headers['X-Tenant-Id'] ||
    null

  // Ensure app user exists (and store email if present)
  await sql`
    insert into public.app_users (id, email)
    values (${user.userId}::uuid, ${user.email ?? null})
    on conflict (id) do update
      set email = coalesce(public.app_users.email, excluded.email)
  `

  // HARD BLOCK: disabled users must never fall back
  // (This is the critical fix that prevents the "login works again" scenario.)
  const disabledRows = await sql`
    select is_disabled
    from public.app_users
    where id = ${user.userId}::uuid
    limit 1
  `
  if (disabledRows[0]?.is_disabled) {
    return { error: 'ACCOUNT_DISABLED' }
  }

  // Check for active tenant (multi-tenant switching)
  const activeTenantId =
    event.headers['x-active-tenant'] ||
    event.headers['X-Active-Tenant'] ||
    null

  // If active tenant specified, validate membership for it
  if (activeTenantId) {
    const rows = await sql`
      select tm.tenant_id::text as tenant_id, tm.role, tm.features as user_features, t.business_type, t.features as tenant_features
      from public.tenant_memberships tm
      join public.app_users u on u.id = tm.user_id
      join public.tenants t on t.id = tm.tenant_id
      where tm.user_id = ${user.userId}::uuid
        and tm.tenant_id = ${activeTenantId}::uuid
        and u.is_disabled is not true
      limit 1
    `
    if (!rows.length) return { error: 'Not authorized for selected tenant' }
    return {
      tenantId: rows[0].tenant_id,
      role: rows[0].role,
      businessType: rows[0].business_type,
      tenantFeatures: rows[0].tenant_features || [],
      userFeatures: rows[0].user_features,
      mode: 'membership'
    }
  }

  // If tenant explicitly requested (legacy x-tenant-id header), require membership for it
  if (requestedTenantId) {
    const rows = await sql`
      select tm.tenant_id::text as tenant_id, tm.role, tm.features as user_features, t.business_type, t.features as tenant_features
      from public.tenant_memberships tm
      join public.app_users u on u.id = tm.user_id
      join public.tenants t on t.id = tm.tenant_id
      where tm.user_id = ${user.userId}::uuid
        and tm.tenant_id = ${requestedTenantId}::uuid
        and u.is_disabled is not true
      limit 1
    `
    if (!rows.length) return { error: 'Not authorized for requested tenant' }
    return {
      tenantId: rows[0].tenant_id,
      role: rows[0].role,
      businessType: rows[0].business_type,
      tenantFeatures: rows[0].tenant_features || [],
      userFeatures: rows[0].user_features,
      mode: 'membership'
    }
  }

  // Default tenant from memberships
  const rows = await sql`
    select tm.tenant_id::text as tenant_id, tm.role, tm.features as user_features, t.business_type, t.features as tenant_features
    from public.tenant_memberships tm
    join public.app_users u on u.id = tm.user_id
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = ${user.userId}::uuid
      and u.is_disabled is not true
    order by tm.created_at asc
    limit 1
  `
  if (rows.length) return {
    tenantId: rows[0].tenant_id,
    role: rows[0].role,
    businessType: rows[0].business_type,
    tenantFeatures: rows[0].tenant_features || [],
    userFeatures: rows[0].user_features,
    mode: 'membership'
  }

  // Check if user is SuperAdmin (no tenant membership required)
  const { SUPER_ADMIN_EMAILS } = process.env
  const adminEmails = SUPER_ADMIN_EMAILS ? SUPER_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : []
  const userEmailLower = (user.email || '').toLowerCase().trim()
  
  if (adminEmails.includes(userEmailLower)) {
    // SuperAdmin trying to access a specific tenant (impersonation mode)
    if (activeTenantId) {
      const tenantRows = await sql`
        SELECT id::text as tenant_id, name as tenant_name, business_type, features as tenant_features
        FROM tenants
        WHERE id = ${activeTenantId}::uuid
        LIMIT 1
      `
      
      if (tenantRows.length > 0) {
        console.log('SuperAdmin impersonating tenant:', tenantRows[0].tenant_name)
        return {
          tenantId: tenantRows[0].tenant_id,
          role: 'super_admin',  // Keep super_admin role
          businessType: tenantRows[0].business_type,
          tenantFeatures: tenantRows[0].tenant_features || [],
          userFeatures: null,  // Full access to all tenant features
          mode: 'super_admin_impersonating'
        }
      }
      
      // Requested tenant doesn't exist
      return {
        error: 'TENANT_NOT_FOUND',
        message: 'The requested tenant does not exist'
      }
    }
    
    // SuperAdmin without tenant selected - global mode
    return {
      tenantId: null, // SuperAdmin has no specific tenant
      role: 'super_admin',
      businessType: null,
      tenantFeatures: [],
      userFeatures: null,
      mode: 'super_admin'
    }
  }

  // SECURITY FIX: No membership and not SuperAdmin => access denied
  // Do NOT fall back to TENANT_ID as it causes data leakage between users
  return {
    error: 'NO_TENANT_ACCESS',
    message: 'User has no tenant memberships. Contact administrator to assign tenant access.'
  }
}

