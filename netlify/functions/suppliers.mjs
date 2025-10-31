// netlify/functions/suppliers.mjs
import { neon } from '@neondatabase/serverless'

/** Default single-tenant UUID for now (replace/remove when you add switching) */
const DEFAULT_TENANT = 'c00e0058-3dec-4300-829d-cca7e3033ca6'

/**
 * Derive tenant_id for multi-tenant setups.
 * For now, if none is provided, we fall back to DEFAULT_TENANT.
 * Later, remove the fallback and require an explicit tenant (header/JWT).
 */
function getTenantIdFromEvent(event) {
  const h = (k) => event.headers?.[k] || event.headers?.[k?.toLowerCase?.()]
  // Preferred: custom header
  const fromHeader = h('x-tenant-id')
  if (fromHeader) return String(fromHeader)

  // Fallback: query param (handy for local testing)
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const q = url.searchParams.get('tenant_id')
    if (q) return String(q)
  } catch {}

  // Current single-tenant default
  return DEFAULT_TENANT
}

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'vary': 'X-Tenant-Id',
    },
    body: JSON.stringify(bodyObj),
  }
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET'
    const sql = neon(process.env.DATABASE_URL)

    // ----- CORS preflight (optional) -----
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'Content-Type, X-Tenant-Id',
          'cache-control': 'no-store',
          'vary': 'X-Tenant-Id',
        },
        body: '',
      }
    }

    // ----- LIST SUPPLIERS (GET) -----
    if (method === 'GET') {
      const tenantId = getTenantIdFromEvent(event)

      const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
      const q = (url.searchParams.get('q') || '').trim().toLowerCase()

      const rows = await sql/*sql*/`
        select
          s.id,
          s.name,
          s.country,
          0::numeric as total_amount,  -- placeholder: sum(qty*unit_price) - payments
          0::numeric as total_qty      -- placeholder: sum(qty) - delivered
        from suppliers s
        where s.tenant_id = ${tenantId}
          and (${q === ''} or lower(s.name) like ${'%' + q + '%'})
        order by lower(s.name) asc
        limit 500;
      `
      return json(200, { suppliers: rows })
    }

    // ----- CREATE SUPPLIER (POST) -----
    if (method === 'POST') {
      const tenantId = getTenantIdFromEvent(event)

      const body = JSON.parse(event.body || '{}')
      const {
        name,
        phone = null,
        email = null,
        address1 = null,
        address2 = null,
        city = null,
        state = null,
        postal_code = null,
        country = null,
      } = body

      if (!name || !String(name).trim()) {
        return json(400, { error: 'Missing supplier name' })
      }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
        return json(400, { error: 'Invalid email format' })
      }

      const rows = await sql/*sql*/`
        insert into suppliers (
          tenant_id, name, phone, email, address1, address2, city, state, postal_code, country
        )
        values (
          ${tenantId},
          ${String(name).trim()},
          ${phone ? String(phone).trim() : null},
          ${email ? String(email).trim() : null},
          ${address1 ? String(address1).trim() : null},
          ${address2 ? String(address2).trim() : null},
          ${city ? String(city).trim() : null},
          ${state ? String(state).trim() : null},
          ${postal_code ? String(postal_code).trim() : null},
          ${country ? String(country).trim() : null}
        )
        returning id, name;
      `

      return json(200, { supplier: rows?.[0] ?? null })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (err) {
    return json(500, { error: String(err?.message || err) })
  }
}



