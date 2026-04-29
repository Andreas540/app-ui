// netlify/functions/get-customer-offers.mjs
// GET /api/get-customer-offers?customer_id=UUID
// Returns all tenant products with any customer-specific price/availability overrides.

import { resolveAuthz } from './utils/auth.mjs'

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

    const products = await sql`
      SELECT
        p.id,
        p.name,
        p.price_amount::float8          AS price_amount,
        o.price_amount::float8          AS offer_price_amount,
        COALESCE(o.is_available, true)  AS offer_is_available
      FROM products p
      LEFT JOIN customer_product_offers o
        ON  o.product_id   = p.id
        AND o.tenant_id    = p.tenant_id
        AND o.customer_id  = ${customerId}::uuid
      WHERE p.tenant_id  = ${TENANT_ID}
        AND p.category   = 'product'
        AND p.price_amount IS NOT NULL
      ORDER BY p.name ASC
    `

    return cors(200, { products })
  } catch (e) {
    console.error('get-customer-offers error:', e)
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
