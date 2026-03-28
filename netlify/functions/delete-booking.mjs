// netlify/functions/delete-booking.mjs
// DELETE /api/delete-booking  { id: bookingId }
// Deletes a booking. If it was the only booking on its order, the order is deleted too.
// If multiple bookings share the order, only the booking is removed.

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'DELETE') return deleteBooking(event)
  return cors(405, { error: 'Method not allowed' })
}

async function deleteBooking(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body
    const { id } = JSON.parse(rawBody || '{}')
    if (!id) return cors(400, { error: 'id is required' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Fetch the booking to get its order_id
    const bookingRows = await sql`
      SELECT id, order_id FROM bookings
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      LIMIT 1
    `
    if (!bookingRows.length) return cors(404, { error: 'Booking not found' })
    const orderId = bookingRows[0].order_id

    if (orderId) {
      // Count how many bookings are linked to this order
      const countRows = await sql`
        SELECT COUNT(*)::int AS count FROM bookings
        WHERE order_id = ${orderId} AND tenant_id = ${TENANT_ID}
      `
      const linkedCount = countRows[0].count

      if (linkedCount <= 1) {
        // This is the only booking — delete the order (and booking with it)
        await sql`DELETE FROM order_items WHERE order_id = ${orderId}`
        await sql`DELETE FROM order_partners WHERE order_id = ${orderId}`
        await sql`DELETE FROM bookings WHERE id = ${id} AND tenant_id = ${TENANT_ID}`
        await sql`DELETE FROM orders WHERE id = ${orderId} AND tenant_id = ${TENANT_ID}`
        return cors(200, { ok: true, order_deleted: true })
      }
    }

    // Either no order, or multiple bookings on the order — just delete the booking
    await sql`DELETE FROM bookings WHERE id = ${id} AND tenant_id = ${TENANT_ID}`
    return cors(200, { ok: true, order_deleted: false })

  } catch (e) {
    console.error('delete-booking error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: JSON.stringify(body),
  }
}
