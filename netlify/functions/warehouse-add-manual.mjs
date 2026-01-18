// netlify/functions/warehouse-add-manual.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'POST')   return addManualEntry(event)
  return cors(405, { error: 'Method not allowed' })
}

async function addManualEntry(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const body = JSON.parse(event.body || '{}')
    const {
      product_id,
      qty,
      date,
      flag = 'M', // Default to 'M' if not provided
      product_cost,
      labor_cost,
      notes
    } = body

    // Validation
    if (!product_id) {
      return cors(400, { error: 'product_id is required' })
    }
    if (!qty || !Number.isInteger(qty) || qty === 0) {
      return cors(400, { error: 'qty must be a non-zero integer' })
    }
    if (!date) {
      return cors(400, { error: 'date is required' })
    }
    if (!['M', 'P'].includes(flag)) {
      return cors(400, { error: 'flag must be either M or P' })
    }

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Get product name
    const products = await sql`
      SELECT name
      FROM products
      WHERE id = ${product_id}
      LIMIT 1
    `
    
    if (products.length === 0) {
      return cors(400, { error: 'Invalid product_id' })
    }

    const productName = products[0].name

    // Insert warehouse delivery entry
    const result = await sql`
      INSERT INTO warehouse_deliveries (
        tenant_id,
        date,
        supplier_manual_delivered,
        product,
        customer,
        qty,
        product_cost,
        labor_cost,
        order_supplier_id,
        order_id,
        product_id,
        notes
      ) VALUES (
        ${TENANT_ID},
        ${date},
        ${flag},
        ${productName},
        NULL,
        ${qty},
        ${product_cost ?? null},
        ${labor_cost ?? null},
        NULL,
        NULL,
        ${product_id},
        ${notes ?? null}
      )
      RETURNING id
    `

    return cors(201, {
      ok: true,
      id: result[0].id,
      message: 'Warehouse entry created successfully'
    })
  } catch (e) {
    console.error('addManualEntry error:', e)
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