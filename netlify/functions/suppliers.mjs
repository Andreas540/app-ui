// netlify/functions/suppliers.mjs
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
      'cache-control': 'no-store',
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
          'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
          'cache-control': 'no-store',
        },
        body: '',
      }
    }

    // ----- LIST SUPPLIERS (GET) -----
    if (method === 'GET') {
      // Resolve tenant from JWT
      const authz = await resolveAuthz({ sql, event })
      if (authz.error) return json(403, { error: authz.error })
      const tenantId = authz.tenantId

      const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
      const q = (url.searchParams.get('q') || '').trim().toLowerCase()

      const rows = await sql/*sql*/`
        select
          s.id,
          s.name,
          s.country,
          (
            coalesce(
              (
                select sum(ois.qty * ois.product_cost + ois.qty * ois.shipping_cost)
                from orders_suppliers os
                join order_items_suppliers ois on ois.order_id = os.id
                where os.supplier_id = s.id and os.tenant_id = ${tenantId}
              ), 0
            ) - coalesce(
              (
                select sum(amount)
                from supplier_payments
                where supplier_id = s.id and tenant_id = ${tenantId}
              ), 0
            )
          )::numeric(12,2) as owed_to_supplier
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
      // Resolve tenant from JWT
      const authz = await resolveAuthz({ sql, event })
      if (authz.error) return json(403, { error: authz.error })
      const tenantId = authz.tenantId

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



