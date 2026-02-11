/**
 * Log user activity with enhanced context
 */
export async function logActivity({ sql, event, action, success = true, error = null }) {
  try {
    const userId = extractUserId(event)
    const tenantId = extractTenantId(event)
    const endpoint = event.path || event.rawUrl || null
    
    // Extract user email and name from JWT
    let email = null
    let name = null
    try {
      const authHeader = event.headers.authorization || event.headers.Authorization
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const jwt = await import('jsonwebtoken')
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        email = decoded.email || null
      }
    } catch (e) {
      // JWT decode failed, skip email/name
    }

    // Get name and tenant_name from database
    if (userId) {
      try {
        const userRows = await sql`
          SELECT u.name, t.name as tenant_name
          FROM users u
          LEFT JOIN tenants t ON t.id = ${tenantId}::uuid
          WHERE u.id = ${userId}::uuid
          LIMIT 1
        `
        if (userRows.length > 0) {
          name = userRows[0].name
        }
        
        // Get tenant name separately if needed
        if (tenantId && userRows.length > 0 && userRows[0].tenant_name) {
          // Already got it in the join above
        } else if (tenantId) {
          const tenantRows = await sql`
            SELECT name FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
          `
          if (tenantRows.length > 0) {
            name = name || tenantRows[0].name // Use tenant name if user name missing
          }
        }
      } catch (e) {
        console.error('Failed to fetch user/tenant names for logging:', e)
      }
    }

    const { ip_address, user_agent, device_type, browser, os } = parseDeviceInfo(event)

    // Insert log entry with all fields
    if (tenantId) {
      await sql`
        INSERT INTO user_activity_log (
          user_id, tenant_id, action, endpoint, 
          ip_address, user_agent, device_type, browser, os,
          success, error_message, email, name, tenant_name
        )
        VALUES (
          ${userId}::uuid, ${tenantId}::uuid, ${action}, ${endpoint},
          ${ip_address}, ${user_agent}, ${device_type}, ${browser}, ${os},
          ${success}, ${error}, ${email}, ${name}, ${extractTenantName(sql, tenantId)}
        )
      `
    } else {
      // No tenant (e.g., SuperAdmin actions)
      await sql`
        INSERT INTO user_activity_log (
          user_id, action, endpoint,
          ip_address, user_agent, device_type, browser, os,
          success, error_message, email, name
        )
        VALUES (
          ${userId}::uuid, ${action}, ${endpoint},
          ${ip_address}, ${user_agent}, ${device_type}, ${browser}, ${os},
          ${success}, ${error}, ${email}, ${name}
        )
      `
    }
  } catch (e) {
    console.error('Activity logging failed:', e)
    // Don't throw - logging should never break the app
  }
}

// Helper to get tenant name (cached to avoid repeated queries)
async function extractTenantName(sql, tenantId) {
  if (!tenantId) return null
  try {
    const rows = await sql`SELECT name FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`
    return rows[0]?.name || null
  } catch {
    return null
  }
}

function extractUserId(event) {
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) return null
    
    const token = authHeader.substring(7)
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    return decoded.userId || null
  } catch {
    return null
  }
}

function extractTenantId(event) {
  return event.headers['x-active-tenant'] || 
         event.headers['X-Active-Tenant'] || 
         null
}

function parseDeviceInfo(event) {
  const ua = event.headers['user-agent'] || ''
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             event.headers['x-real-ip'] || 
             null

  let device_type = 'desktop'
  let browser = 'unknown'
  let os = 'unknown'

  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
    device_type = /ipad/i.test(ua) ? 'tablet' : 'mobile'
  } else if (/tablet/i.test(ua)) {
    device_type = 'tablet'
  }

  if (/chrome/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome'
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'
  else if (/firefox/i.test(ua)) browser = 'Firefox'
  else if (/edge|edg/i.test(ua)) browser = 'Edge'

  if (/windows/i.test(ua)) os = 'Windows'
  else if (/mac/i.test(ua)) os = 'macOS'
  else if (/linux/i.test(ua)) os = 'Linux'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'

  return { ip_address: ip, user_agent: ua, device_type, browser, os }
}