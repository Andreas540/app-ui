// netlify/functions/retry-failed-reminders.mjs
// Netlify scheduled function — runs every hour.
// Re-queues transient-failed SMS message_jobs (up to MAX_RETRIES attempts).
// Permanent failures (no phone, no consent, cap reached, no template) are never retried.

export const config = {
  schedule: '0 * * * *',
}

const MAX_RETRIES = 3

// Errors that indicate a permanent failure — do not retry these.
const PERMANENT_ERROR_SUBSTRINGS = [
  'No phone number',
  'SMS consent not given',
  'No message template found',
  'Monthly SMS cap reached',
]

function isPermanentError(errorMessage) {
  if (!errorMessage) return false
  return PERMANENT_ERROR_SUBSTRINGS.some(s => errorMessage.includes(s))
}

export async function handler() {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) { console.error('DATABASE_URL missing'); return { statusCode: 500 } }

    const sql = neon(DATABASE_URL)

    // Find failed SMS jobs that:
    //   • failed within the last 24 hours (avoids retrying very old stale jobs)
    //   • haven't hit the retry cap
    //   • are not permanent failures
    //   • the underlying booking is not canceled
    const failedJobs = await sql`
      SELECT
        mj.id,
        mj.tenant_id,
        mj.retry_count,
        mj.error_message,
        mj.scheduled_for,
        b.booking_status
      FROM message_jobs mj
      LEFT JOIN bookings b ON b.id = mj.booking_id
      WHERE mj.channel = 'sms'
        AND mj.status = 'failed'
        AND mj.retry_count < ${MAX_RETRIES}
        AND mj.failed_at >= now() - interval '24 hours'
        AND (b.booking_status IS NULL OR b.booking_status NOT IN ('canceled'))
      ORDER BY mj.failed_at ASC
      LIMIT 100
    `

    if (!failedJobs.length) return { statusCode: 200 }

    let requeued = 0
    let skipped = 0

    for (const job of failedJobs) {
      // Skip permanent errors
      if (isPermanentError(job.error_message)) {
        skipped++
        continue
      }

      // Re-queue: reset status to queued, clear error, increment retry_count.
      // Schedule for "now + 15min * retry_count" to give some backoff.
      const backoffMinutes = 15 * (job.retry_count + 1)
      const newScheduledFor = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

      await sql`
        UPDATE message_jobs
        SET
          status        = 'queued',
          error_message = null,
          failed_at     = null,
          scheduled_for = ${newScheduledFor},
          retry_count   = retry_count + 1,
          updated_at    = now()
        WHERE id = ${job.id}
          AND status = 'failed'
      `
      requeued++
    }

    console.log(`retry-failed-reminders: requeued=${requeued} skipped=${skipped}`)
    return { statusCode: 200 }
  } catch (e) {
    console.error('retry-failed-reminders error:', e)
    return { statusCode: 500 }
  }
}
