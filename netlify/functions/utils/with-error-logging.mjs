// netlify/functions/utils/with-error-logging.mjs
// Wraps a Netlify function handler: catches any unhandled throw, logs it to
// user_activity_log (action = `${featureName}_error`), and returns a 500.
//
// Usage — replace the export in any function file:
//
//   import { withErrorLogging } from './utils/with-error-logging.mjs'
//
//   export const handler = withErrorLogging('order', async (event) => {
//     // no try/catch needed — just let errors throw
//   })
//
// The sub-functions called from the handler should also omit try/catch so
// errors propagate up to this wrapper.

import { neon }        from '@neondatabase/serverless'
import { logActivity } from './activity-logger.mjs'

export function withErrorLogging(featureName, handlerFn) {
  return async (event) => {
    try {
      return await handlerFn(event)
    } catch (e) {
      console.error(`[${featureName}] unhandled error:`, e)

      // Best-effort log to user_activity_log — never throws
      try {
        const { DATABASE_URL } = process.env
        if (DATABASE_URL) {
          const sql = neon(DATABASE_URL)
          await logActivity({
            sql,
            event,
            action:  `${featureName}_error`,
            success: false,
            error:   e?.message ?? String(e),
          })
        }
      } catch (logErr) {
        console.error(`[${featureName}] failed to log error activity:`, logErr)
      }

      return {
        statusCode: 500,
        headers: {
          'content-type':                'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers':'content-type, authorization, x-tenant-id, x-active-tenant',
        },
        body: JSON.stringify({ error: e?.message ?? String(e) }),
      }
    }
  }
}
