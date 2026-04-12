// netlify/functions/booking-availability.mjs
// GET  /api/booking-availability?service_id=X  → weekly availability for a service
// POST /api/booking-availability               → save/replace weekly availability
//
// Requires table: service_availability
// See .claude/docs/booking-module-brief.md for migration SQL.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')  return getAvailability(event)
  if (event.httpMethod === 'POST') return saveAvailability(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getAvailability(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const service_id = event.queryStringParameters?.service_id
    if (!service_id) return cors(400, { error: 'service_id is required' })

    const rows = await sql`
      SELECT day_of_week, start_time, end_time
      FROM service_availability
      WHERE tenant_id = ${TENANT_ID} AND service_id = ${service_id}
      ORDER BY day_of_week
    `

    return cors(200, { availability: rows })
  } catch (e) {
    console.error('booking-availability GET error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function saveAvailability(event) {
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
    const { service_id, availability } = body

    if (!service_id) return cors(400, { error: 'service_id is required' })
    if (!Array.isArray(availability)) return cors(400, { error: 'availability must be an array' })

    // Verify the service belongs to this tenant
    const svcRows = await sql`
      SELECT id FROM products
      WHERE id = ${service_id} AND tenant_id = ${TENANT_ID} AND category = 'service'
      LIMIT 1
    `
    if (!svcRows.length) return cors(404, { error: 'Service not found' })

    // Replace all rows for this service atomically
    await sql`DELETE FROM service_availability WHERE tenant_id = ${TENANT_ID} AND service_id = ${service_id}`

    for (const row of availability) {
      const dow = parseInt(row.day_of_week, 10)
      if (isNaN(dow) || dow < 0 || dow > 6) continue
      const start = String(row.start_time || '09:00').slice(0, 5)
      const end   = String(row.end_time   || '17:00').slice(0, 5)
      if (start >= end) continue  // skip invalid windows

      await sql`
        INSERT INTO service_availability (tenant_id, service_id, day_of_week, start_time, end_time)
        VALUES (${TENANT_ID}, ${service_id}, ${dow}, ${start}, ${end})
      `
    }

    return cors(200, { ok: true })
  } catch (e) {
    console.error('booking-availability POST error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
