import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { logActivity } from './utils/activity-logger.mjs'

const sql = neon(process.env.DATABASE_URL)

function cors(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return cors(200, {})
  }

  if (event.httpMethod !== 'POST') {
    return cors(405, { error: 'Method not allowed' })
  }

  try {
    // Verify authentication
    const authHeader = event.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return cors(401, { error: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    
    // Verify JWT token
    let userId
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      userId = decoded.userId
    } catch (err) {
      return cors(401, { error: 'Invalid or expired token' })
    }

    if (!userId) {
      return cors(401, { error: 'Invalid token payload' })
    }

    // Parse request body
    const { currentPassword, newPassword } = JSON.parse(event.body || '{}')

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return cors(400, { error: 'Current password and new password are required' })
    }

    if (newPassword.length < 8) {
      return cors(400, { error: 'New password must be at least 8 characters' })
    }

    // Get user's current password hash
    const userResult = await sql`
      SELECT password_hash 
      FROM users 
      WHERE id = ${userId}
      LIMIT 1
    `

    if (userResult.length === 0) {
      return cors(404, { error: 'User not found' })
    }

    const user = userResult[0]

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash)
    
    if (!isCurrentPasswordValid) {
      // Log failed attempt
      await logActivity({
        sql,
        event,
        action: 'password_change_failed',
        success: false,
        error: 'Incorrect current password'
      })
      
      return cors(400, { error: 'Current password is incorrect' })
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10)

    // Update password in database
    await sql`
      UPDATE users 
      SET password_hash = ${newPasswordHash}
      WHERE id = ${userId}
    `

    // Log successful password change
    await logActivity({
      sql,
      event,
      action: 'password_change',
      success: true
    })

    return cors(200, { success: true, message: 'Password changed successfully' })

  } catch (error) {
    console.error('Change password error:', error)
    
    // Log system error (catch to prevent double-failure)
    try {
      await logActivity({
        sql,
        event,
        action: 'password_change',
        success: false,
        error: error.message
      })
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }
    
    return cors(500, { error: 'Internal server error' })
  }
}