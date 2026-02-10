// netlify/functions/utils/activity-logger.mjs
import { getUserFromToken } from './auth.mjs'

export async function logActivity({ sql, event, action, success = true, error = null }) {
  try {
    console.log('📊 logActivity called for action:', action)  // Debug log
    
    const user = getUserFromToken(event)
    if (!user?.userId) {
      console.log('⚠️ No user found, skipping log')
      return
    }
    
    console.log('👤 Logging for user:', user.userId)  // Debug log
    
    const userAgent = event.headers['user-agent'] || ''
    const deviceInfo = parseUserAgent(userAgent)
    
    const ipAddress = 
      event.headers['x-forwarded-for']?.split(',')[0] ||
      event.headers['x-real-ip'] ||
      'unknown'
    
    const tenantId = 
      event.headers['x-active-tenant'] ||
      event.headers['X-Active-Tenant'] ||
      null
    
    // 🔧 FIXED: Proper SQL syntax for nullable UUID
    if (tenantId) {
      await sql`
        INSERT INTO user_activity_log (
          user_id, tenant_id, action, endpoint, ip_address, user_agent,
          device_type, browser, os, success, error_message
        ) VALUES (
          ${user.userId}::uuid,
          ${tenantId}::uuid,
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
    } else {
      await sql`
        INSERT INTO user_activity_log (
          user_id, action, endpoint, ip_address, user_agent,
          device_type, browser, os, success, error_message
        ) VALUES (
          ${user.userId}::uuid,
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
    }
    
    console.log('✅ Activity logged successfully')  // Debug log
  } catch (err) {
    console.error('❌ Activity logging failed:', err)
  }
}

function parseUserAgent(ua) {
  const result = {
    deviceType: 'unknown',
    browser: 'unknown',
    os: 'unknown'
  }
  
  if (/mobile/i.test(ua)) result.deviceType = 'mobile'
  else if (/tablet|ipad/i.test(ua)) result.deviceType = 'tablet'
  else result.deviceType = 'desktop'
  
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) result.browser = 'Chrome'
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) result.browser = 'Safari'
  else if (/firefox/i.test(ua)) result.browser = 'Firefox'
  else if (/edg/i.test(ua)) result.browser = 'Edge'
  
  if (/android/i.test(ua)) result.os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) result.os = 'iOS'
  else if (/windows/i.test(ua)) result.os = 'Windows'
  else if (/mac/i.test(ua)) result.os = 'macOS'
  else if (/linux/i.test(ua)) result.os = 'Linux'
  
  return result
}