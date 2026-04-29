// netlify/functions/get-customer-booking-offers.mjs
// GET /api/get-customer-booking-offers?customer_id=UUID
// Returns all tenant services with customer-specific price/duration/availability overrides.

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
  if (event.httpMethod !== 'GET') return cors(405, { error: 'Method not allowed' })

  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const customerId = event.queryStringParameters?.customer_id
    if (!customerId) return cors(400, { error: 'customer_id required' })

    await sql.unsafe(CREATE_OFFERS_TABLE)
    await sql.unsafe(CREATE_AVAIL_TABLE)

    const services = await sql`
      SELECT
        p.id,
        p.name,
        p.duration_minutes,
        p.price_amount::float8        AS price_amount,
        o.price_amount::float8        AS offer_price_amount,
        o.duration_minutes            AS offer_duration_minutes,
        COALESCE(o.is_available, true) AS offer_is_available
      FROM products p
      LEFT JOIN customer_service_offers o
        ON  o.service_id   = p.id
        AND o.tenant_id    = p.tenant_id
        AND o.customer_id  = ${customerId}::uuid
      WHERE p.tenant_id = ${TENANT_ID}
        AND p.category  = 'service'
      ORDER BY p.name ASC
    `

    // Customer-specific availability (all services)
    const availRows = await sql`
      SELECT service_id,
             day_of_week,
             to_char(start_time, 'HH24:MI') AS start_time,
             to_char(end_time,   'HH24:MI') AS end_time
      FROM customer_service_availability
      WHERE tenant_id   = ${TENANT_ID}
        AND customer_id = ${customerId}::uuid
      ORDER BY service_id, day_of_week
    `

    // Also load default service_availability so UI can pre-populate when no override exists
    const defaultAvailRows = await sql`
      SELECT service_id,
             day_of_week,
             to_char(start_time, 'HH24:MI') AS start_time,
             to_char(end_time,   'HH24:MI') AS end_time
      FROM service_availability
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY service_id, day_of_week
    `

    // Build maps
    const customerAvail = {}
    for (const r of availRows) {
      if (!customerAvail[r.service_id]) customerAvail[r.service_id] = []
      customerAvail[r.service_id].push(r)
    }

    const defaultAvail = {}
    for (const r of defaultAvailRows) {
      if (!defaultAvail[r.service_id]) defaultAvail[r.service_id] = []
      defaultAvail[r.service_id].push(r)
    }

    return cors(200, { services, customer_availability: customerAvail, default_availability: defaultAvail })
  } catch (e) {
    console.error('get-customer-booking-offers error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
