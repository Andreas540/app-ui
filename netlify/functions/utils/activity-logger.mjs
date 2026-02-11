import jwt from 'jsonwebtoken'

/**
 * Log user activity with enhanced context
 */
export async function logActivity({ sql, event, action, success = true, error = null }) {
  try {
    console.log('📝 logActivity called:', action)
    
    // Extract userId from JWT
    let userId = null
    let email = null
    try {
      const authHeader = event.headers.authorization || event.headers.Authorization
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        userId = decoded.userId || null
        email = decoded.email || null
      }
    } catch (e) {
      console.log('No valid JWT token for logging')
    }

    // Extract tenantId from header
    const tenantId = event.headers['x-active-tenant'] || 
                     event.headers['X-Active-Tenant'] || 
                     null

    const endpoint = event.path || event.rawUrl || null

    // Parse device info
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

    // Get user name and tenant name from database
    let name = null
    let tenant_name = null
    
    if (userId && tenantId) {
      try {
        const rows = await sql`
          SELECT u.name, t.name as tenant_name
          FROM users u
          LEFT JOIN tenants t ON t.id = ${tenantId}::uuid
          WHERE u.id = ${userId}::uuid
          LIMIT 1
        `
        if (rows.length > 0) {
          name = rows[0].name
          tenant_name = rows[0].tenant_name
        }
      } catch (e) {
        console.error('Failed to fetch names:', e)
      }
    } else if (userId) {
      try {
        const rows = await sql`
          SELECT name FROM users WHERE id = ${userId}::uuid LIMIT 1
        `
        if (rows.length > 0) {
          name = rows[0].name
        }
      } catch (e) {
        console.error('Failed to fetch user name:', e)
      }
    }

    console.log('Inserting activity log:', { userId, tenantId, action, email, name, tenant_name })

    // Insert log entry
    await sql`
      INSERT INTO user_activity_log (
        user_id, tenant_id, action, endpoint,
        ip_address, user_agent, device_type, browser, os,
        success, error_message, email, name, tenant_name
      )
      VALUES (
        ${userId}::uuid, ${tenantId}::uuid, ${action}, ${endpoint},
        ${ip}, ${ua}, ${device_type}, ${browser}, ${os},
        ${success}, ${error}, ${email}, ${name}, ${tenant_name}
      )
    `

    console.log('✅ Activity log inserted successfully')
  } catch (e) {
    console.error('❌ Activity logging failed:', e.message, e)
    // Don't throw - logging should never break the app
  }
}