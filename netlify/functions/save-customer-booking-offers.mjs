// netlify/functions/save-customer-booking-offers.mjs
// POST /api/save-customer-booking-offers
// Body: {
//   customer_id,
//   services: [{ service_id, price_amount, duration_minutes, is_available }],
//   availability: { [service_id]: [{ day_of_week, start_time, end_time }] }
// }

import { resolveAuthz } from './utils/auth.mjs'

const CREATE_OFFERS_TABLE = `
  CREATE TABLE IF NOT EXISTS customer_service_offers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    customer_id      UUID NOT NULL,
    service_id       UUID NOT NULL,
    price_amount     NUMERIC(12,2),
    duration_minutes INTEGER,
    is_available     BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, customer_id, service_id)
  )
`

const CREATE_AVAIL_TABLE = `
  CREATE TABLE IF NOT EXISTS customer_service_availability (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    customer_id UUID NOT NULL,
    service_id  UUID NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    UNIQUE(tenant_id, customer_id, service_id, day_of_week)
  )
`

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod !== 'POST') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const body = JSON.parse(event.body || '{}')
    const { customer_id, services = [], availability = {} } = body

    if (!customer_id) return cors(400, { error: 'customer_id required' })

    await sql.unsafe(CREATE_OFFERS_TABLE)
    await sql.unsafe(CREATE_AVAIL_TABLE)

    // ── Service offers ────────────────────────────────────────────────────────
    await sql`
      DELETE FROM customer_service_offers
      WHERE tenant_id   = ${TENANT_ID}
        AND customer_id = ${customer_id}::uuid
    `

    for (const s of services) {
      const price    = s.price_amount    != null && s.price_amount    !== '' ? Number(s.price_amount)    : null
      const duration = s.duration_minutes != null && s.duration_minutes !== '' ? Number(s.duration_minutes) : null
      const isAvail  = s.is_available !== false

      // Only store if there's an actual override
      if (!isAvail || price !== null || duration !== null) {
        await sql`
          INSERT INTO customer_service_offers
            (tenant_id, customer_id, service_id, price_amount, duration_minutes, is_available)
          VALUES
            (${TENANT_ID}, ${customer_id}::uuid, ${s.service_id}::uuid, ${price}, ${duration}, ${isAvail})
        `
      }
    }

    // ── Availability overrides ────────────────────────────────────────────────
    // Delete and replace per-service
    const serviceIds = Object.keys(availability)
    for (const serviceId of serviceIds) {
      await sql`
        DELETE FROM customer_service_availability
        WHERE tenant_id   = ${TENANT_ID}
          AND customer_id = ${customer_id}::uuid
          AND service_id  = ${serviceId}::uuid
      `

      const rows = availability[serviceId] || []
      for (const row of rows) {
        const dow   = parseInt(row.day_of_week, 10)
        const start = String(row.start_time || '09:00').slice(0, 5)
        const end   = String(row.end_time   || '17:00').slice(0, 5)
        if (isNaN(dow) || dow < 0 || dow > 6 || start >= end) continue
        await sql`
          INSERT INTO customer_service_availability
            (tenant_id, customer_id, service_id, day_of_week, start_time, end_time)
          VALUES
            (${TENANT_ID}, ${customer_id}::uuid, ${serviceId}::uuid, ${dow}, ${start}, ${end})
        `
      }
    }

    return cors(200, { ok: true })
  } catch (e) {
    console.error('save-customer-booking-offers error:', e)
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
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
