// netlify/functions/generate-booking-reminders.mjs
// POST /api/generate-booking-reminders
// Body: { booking_id? }  — omit to schedule for ALL upcoming bookings for this tenant.
// Creates message_jobs based on active reminder_rules. De-duplicated via unique index.
// Also cancels queued jobs for canceled bookings.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return generate(event)
  return cors(405, { error: 'Method not allowed' })
}

async function generate(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const body = JSON.parse(rawBody)
    const bookingId = body.booking_id ?? null

    // Load active rules for this tenant
    const rules = await sql`
      SELECT id, rule_name, trigger_event, minutes_offset, channel, template_key, service_id
      FROM reminder_rules
      WHERE tenant_id = ${TENANT_ID} AND active = true
    `

    if (!rules.length) return cors(200, { ok: true, created: 0, message: 'No active rules' })

    // Load upcoming (or specific) bookings that are not canceled
    const bookings = await sql`
      SELECT b.id, b.start_at, b.booking_status, b.payment_status,
             b.customer_id, b.service_id,
             b.tenant_id
      FROM bookings b
      WHERE b.tenant_id = ${TENANT_ID}
        AND b.booking_status NOT IN ('canceled')
        AND b.start_at >= now()
        AND (${bookingId}::uuid IS NULL OR b.id = ${bookingId}::uuid)
      ORDER BY b.start_at ASC
      LIMIT 500
    `

    // Cancel queued jobs for any canceled bookings in same scope
    if (bookingId) {
      await sql`
        UPDATE message_jobs
        SET status = 'canceled', updated_at = now()
        WHERE tenant_id = ${TENANT_ID}
          AND booking_id = ${bookingId}::uuid
          AND status = 'queued'
          AND (
            SELECT booking_status FROM bookings WHERE id = ${bookingId}::uuid
          ) = 'canceled'
      `
    }

    let created = 0
    const now = new Date()

    for (const booking of bookings) {
      for (const rule of rules) {
        // Rule service_id null = applies to all services; otherwise must match
        if (rule.service_id && rule.service_id !== booking.service_id) continue

        let scheduledFor

        if (rule.trigger_event === 'before_start') {
          // minutes_offset is negative = before start (e.g. -1440 = 24h before)
          scheduledFor = new Date(new Date(booking.start_at).getTime() + rule.minutes_offset * 60 * 1000)
        } else if (rule.trigger_event === 'booking_confirmed') {
          // Schedule relative to now (offset from confirmation)
          scheduledFor = new Date(now.getTime() + rule.minutes_offset * 60 * 1000)
        } else if (rule.trigger_event === 'unpaid_balance') {
          // Schedule relative to start_at (e.g. +1440 = 24h after start if still unpaid)
          if (booking.payment_status === 'paid') continue // skip if already paid
          scheduledFor = new Date(new Date(booking.start_at).getTime() + rule.minutes_offset * 60 * 1000)
        } else {
          continue
        }

        // Don't schedule jobs in the past
        if (scheduledFor <= now) continue

        try {
          await sql`
            INSERT INTO message_jobs (
              tenant_id, booking_id, customer_id, channel, template_key,
              scheduled_for, status, billable, stripe_reported
            ) VALUES (
              ${TENANT_ID}, ${booking.id}, ${booking.customer_id},
              ${rule.channel}, ${rule.template_key},
              ${scheduledFor.toISOString()}, 'queued', false, false
            )
            ON CONFLICT (tenant_id, booking_id, template_key, channel, scheduled_for)
              DO NOTHING
          `
          created++
        } catch (_) {
          // Conflict = already exists, skip
        }
      }
    }

    return cors(200, { ok: true, created, bookings_processed: bookings.length })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
