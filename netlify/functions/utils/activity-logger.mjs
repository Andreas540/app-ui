// netlify/functions/utils/activity-logger.mjs
import { getUserFromToken } from './auth.mjs'

/**
 * Log user activity
 */
export async function logActivity({ sql, event, action, success = true, error = null }) {
  try {
    const user = getUserFromToken(event)
    if (!user?.userId) return // Don't log if no user
    
    // Extract device info from user-agent
    const userAgent = event.headers['user-agent'] || ''
    const deviceInfo = parseUserAgent(userAgent)
    
    // Get IP address
    const ipAddress = 
      event.headers['x-forwarded-for']?.split(',')[0] ||
      event.headers['x-real-ip'] ||
      'unknown'
    
    // Get tenant from header
    const tenantId = 
      event.headers['x-active-tenant'] ||
      event.headers['X-Active-Tenant'] ||
      null
    
    await sql`
      INSERT INTO user_activity_log (
        user_id,
        tenant_id,
        action,
        endpoint,
        ip_address,
        user_agent,
        device_type,
        browser,
        os,
        success,
        error_message
      ) VALUES (
        ${user.userId}::uuid,
        ${tenantId ? `${tenantId}::uuid` : null},
        ${action},
        ${event.path || event.rawUrl || 'unknown'},
        ${ipAddress},
        ${userAgent},
        ${deviceInfo.deviceType},
        ${deviceInfo.browser},
        ${deviceInfo.os},
        ${success},
        ${error}
      )
    `
  } catch (err) {
    // Don't let logging errors break the main function
    console.error('Activity logging failed:', err)
  }
}

function parseUserAgent(ua) {
  const result = {
    deviceType: 'unknown',
    browser: 'unknown',
    os: 'unknown'
  }
  
  // Device type
  if (/mobile/i.test(ua)) result.deviceType = 'mobile'
  else if (/tablet|ipad/i.test(ua)) result.deviceType = 'tablet'
  else result.deviceType = 'desktop'
  
  // Browser
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) result.browser = 'Chrome'
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) result.browser = 'Safari'
  else if (/firefox/i.test(ua)) result.browser = 'Firefox'
  else if (/edg/i.test(ua)) result.browser = 'Edge'
  
  // OS
  if (/android/i.test(ua)) result.os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) result.os = 'iOS'
  else if (/windows/i.test(ua)) result.os = 'Windows'
  else if (/mac/i.test(ua)) result.os = 'macOS'
  else if (/linux/i.test(ua)) result.os = 'Linux'
  
  return result
}