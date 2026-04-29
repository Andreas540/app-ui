// netlify/functions/save-customer-offers.mjs
// POST /api/save-customer-offers
// Body: { customer_id, offers: [{ product_id, price_amount, is_available }] }
// Replaces all offer overrides for this customer. Only stores rows that differ
// from defaults (is_available=false or custom price set).

import { resolveAuthz } from './utils/auth.mjs'

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
    const { customer_id, offers } = body

    if (!customer_id) return cors(400, { error: 'customer_id required' })
    if (!Array.isArray(offers)) return cors(400, { error: 'offers must be an array' })

    await sql`
      CREATE TABLE IF NOT EXISTS customer_product_offers (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL,
        customer_id UUID NOT NULL,
        product_id  UUID NOT NULL,
        price_amount NUMERIC(12,2),
        is_available BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now(),
        UNIQUE(tenant_id, customer_id, product_id)
      )
    `

    // Delete all existing overrides for this customer
    await sql`
      DELETE FROM customer_product_offers
      WHERE tenant_id   = ${TENANT_ID}
        AND customer_id = ${customer_id}::uuid
    `

    // Insert only rows that differ from defaults
    const toInsert = offers.filter(o =>
      o.is_available === false || (o.price_amount != null && o.price_amount !== '')
    )

    for (const o of toInsert) {
      const price = o.price_amount != null && o.price_amount !== ''
        ? Number(o.price_amount)
        : null
      await sql`
        INSERT INTO customer_product_offers
          (tenant_id, customer_id, product_id, price_amount, is_available)
        VALUES
          (${TENANT_ID}, ${customer_id}::uuid, ${o.product_id}::uuid, ${price}, ${o.is_available !== false})
      `
    }

    return cors(200, { ok: true })
  } catch (e) {
    console.error('save-customer-offers error:', e)
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
