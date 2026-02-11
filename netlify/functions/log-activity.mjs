// netlify/functions/log-activity.mjs
// Simple endpoint for frontend-initiated activity logging
import { neon } from '@neondatabase/serverless'
import { logActivity } from './utils/activity-logger.mjs'

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Active-Tenant'
    },
    body: JSON.stringify(body)
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  
  if (event.httpMethod !== 'POST') {
    return cors(405, { error: 'Method not allowed' })
  }

  try {
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const body = JSON.parse(event.body || '{}')
    const { action, error } = body

    if (!action) {
      return cors(400, { error: 'Action required' })
    }

    // Log the activity
    await logActivity({
      sql,
      event,
      action,
      success: !error,
      error: error || null
    })

    return cors(200, { success: true })
  } catch (e) {
    console.error('Log activity error:', e)
    return cors(500, { error: 'Failed to log activity' })
  }
}