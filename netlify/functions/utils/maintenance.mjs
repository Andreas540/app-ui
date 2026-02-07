// 🔴 FLIP THIS TO KILL ALL SESSIONS
export const MAINTENANCE_MODE = true

export function checkMaintenance() {
  if (MAINTENANCE_MODE) {
    return {
      statusCode: 503,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ 
        error: 'MAINTENANCE',
        message: 'System is under maintenance.' 
      })
    }
  }
  return null
}