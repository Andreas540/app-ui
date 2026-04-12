// netlify/functions/merge-customer.mjs
// POST — merge two customers into one.
//
// Body: {
//   winning_id: string,   // customer to keep
//   losing_id:  string,   // customer to delete after reassignment
//   data: {               // final field values (from edited form)
//     name, company_name, phone, email, customer_type, shipping_cost,
//     address1, address2, city, state, postal_code, country, sms_consent
//   }
// }

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST') return mergeCustomers(event)
  return cors(405, { error: 'Method not allowed' })
}

async function mergeCustomers(event) {
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

    const { winning_id, losing_id, data } = body

    if (!winning_id || !losing_id) return cors(400, { error: 'winning_id and losing_id are required' })
    if (winning_id === losing_id)  return cors(400, { error: 'Cannot merge a customer with itself' })
    if (!data || !data.name?.trim()) return cors(400, { error: 'name is required' })

    // Verify both customers belong to this tenant
    const both = await sql`
      SELECT id FROM customers
      WHERE tenant_id = ${TENANT_ID} AND id = ANY(ARRAY[${winning_id}, ${losing_id}]::uuid[])
    `
    if (both.length !== 2) return cors(404, { error: 'One or both customers not found' })

    const sc = data.shipping_cost != null && data.shipping_cost !== ''
      ? Number(data.shipping_cost)
      : null
    if (sc !== null && !Number.isFinite(sc)) return cors(400, { error: 'Invalid shipping_cost' })

    // 1. Update the winning customer with the merged/edited data
    await sql`
      UPDATE customers SET
        name          = ${data.name.trim()},
        company_name  = ${data.company_name?.trim() || null},
        phone         = ${data.phone?.trim()        || null},
        email         = ${data.email?.trim().toLowerCase() || null},
        customer_type = ${data.customer_type        || 'Direct'},
        shipping_cost = ${sc},
        address1      = ${data.address1?.trim()     || null},
        address2      = ${data.address2?.trim()     || null},
        city          = ${data.city?.trim()         || null},
        state         = ${data.state?.trim()        || null},
        postal_code   = ${data.postal_code?.trim()  || null},
        country       = ${data.country?.trim()      || null},
        sms_consent   = ${!!data.sms_consent}
      WHERE tenant_id = ${TENANT_ID} AND id = ${winning_id}
    `

    // 2. Reassign all references from losing → winning
    await sql`UPDATE orders    SET customer_id = ${winning_id} WHERE tenant_id = ${TENANT_ID} AND customer_id = ${losing_id}`
    await sql`UPDATE payments  SET customer_id = ${winning_id} WHERE tenant_id = ${TENANT_ID} AND customer_id = ${losing_id}`
    await sql`UPDATE bookings  SET customer_id = ${winning_id} WHERE tenant_id = ${TENANT_ID} AND customer_id = ${losing_id}`
    await sql`UPDATE booking_customer_links SET customer_id = ${winning_id} WHERE customer_id = ${losing_id}`
    await sql`UPDATE message_jobs SET customer_id = ${winning_id} WHERE customer_id = ${losing_id}`

    // shipping_cost_history: keep winner's history, discard loser's
    await sql`DELETE FROM shipping_cost_history WHERE tenant_id = ${TENANT_ID} AND customer_id = ${losing_id}`

    // 3. Delete the losing customer
    await sql`DELETE FROM customers WHERE tenant_id = ${TENANT_ID} AND id = ${losing_id}`

    return cors(200, { ok: true, winning_id })

  } catch (e) {
    console.error('merge-customer error:', e)
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
