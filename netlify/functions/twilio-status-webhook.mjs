// netlify/functions/twilio-status-webhook.mjs
// POST /api/twilio-status-webhook
// Receives Twilio delivery status callbacks and updates message_jobs.
// Configure in Twilio console: Status Callback URL = https://your-app.netlify.app/api/twilio-status-webhook

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, '')
  if (event.httpMethod !== 'POST') return response(405, 'Method not allowed')

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return response(500, 'DATABASE_URL missing')

    const sql = neon(DATABASE_URL)

    // Parse Twilio's URL-encoded body
    const params = new URLSearchParams(event.body || '')
    const messageSid    = params.get('MessageSid')
    const messageStatus = params.get('MessageStatus') // sent, delivered, failed, undelivered
    const errorCode     = params.get('ErrorCode')
    const errorMessage  = params.get('ErrorMessage')

    if (!messageSid || !messageStatus) return response(400, 'Missing MessageSid or MessageStatus')

    // Map Twilio status → our status
    const statusMap = {
      queued:      'accepted',
      sent:        'sent',
      delivered:   'delivered',
      failed:      'failed',
      undelivered: 'failed',
    }
    const ourStatus = statusMap[messageStatus] ?? messageStatus

    await sql`
      UPDATE message_jobs SET
        status        = ${ourStatus},
        delivered_at  = CASE WHEN ${messageStatus} = 'delivered' THEN now() ELSE delivered_at END,
        failed_at     = CASE WHEN ${messageStatus} IN ('failed','undelivered') THEN now() ELSE failed_at END,
        error_message = CASE WHEN ${errorCode} IS NOT NULL THEN ${errorCode || ''} || ' ' || ${errorMessage || ''} ELSE error_message END,
        updated_at    = now()
      WHERE provider_message_id = ${messageSid}
        AND provider_name = 'twilio'
    `

    return response(204, '')
  } catch (e) {
    console.error('twilio-status-webhook error:', e)
    return response(500, String(e?.message || e))
  }
}

function response(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'text/plain' },
    body: body || '',
  }
}
