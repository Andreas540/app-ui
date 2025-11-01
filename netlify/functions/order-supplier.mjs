// netlify/functions/order-supplier.mjs
import { neon } from '@neondatabase/serverless'

const DEFAULT_TENANT = 'c00e0058-3dec-4300-829d-cca7e3033ca6'
const getTenantId = (event) => {
  const h = (k) => event.headers?.[k] || event.headers?.[k?.toLowerCase?.()]
  const fromHeader = h('x-tenant-id')
  if (fromHeader) return String(fromHeader)
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
    const q = url.searchParams.get('tenant_id')
    if (q) return String(q)
  } catch {}
  return DEFAULT_TENANT
}
const json = (code, obj) => ({
  statusCode: code,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'X-Tenant-Id',
  },
  body: JSON.stringify(obj),
})

export const handler = async (event) => {
  try {
    const method = event.httpMethod || 'GET'
    const sql = neon(process.env.DATABASE_URL)
    const tenantId = getTenantId(event)

    // -------- GET: last-cost for supplier+product ----------
    if (method === 'GET') {
      const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
      const fn = url.searchParams.get('fn')
      if (fn === 'last-cost') {
        const supplier_id = url.searchParams.get('supplier_id')
        const product_id  = url.searchParams.get('product_id')
        if (!supplier_id || !product_id) return json(400, { error: 'Missing supplier_id or product_id' })

        // Find most recent product_cost for this supplier+product
        const rows = await sql`
          select ois.product_cost
          from order_items_suppliers ois
          join orders_suppliers os
            on os.id = ois.order_id
          where ois.tenant_id = ${tenantId}
            and os.tenant_id = ${tenantId}
            and os.supplier_id = ${supplier_id}
            and ois.product_id = ${product_id}
          order by ois.created_at desc
          limit 1
        `
        const last_cost = rows?.[0]?.product_cost ?? null
        return json(200, { last_cost })
      }
      return json(400, { error: 'Unknown or missing fn' })
    }

    // -------- POST: create header + lines in one go ----------
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const {
        supplier_id,
        delivered = false,
        received  = false,
        in_customs = false,
        order_date = null,
        est_delivery_date = null,
        notes = null,
        lines = [],
      } = body

      if (!supplier_id) return json(400, { error: 'Missing supplier_id' })
      if (!Array.isArray(lines) || lines.length === 0) return json(400, { error: 'No lines provided' })

      // Clean + validate lines
      const cleaned = lines.map((l) => ({
        product_id: l.product_id ? String(l.product_id) : null,
        qty: Number(l.qty || 0),
        product_cost: Number(l.product_cost || 0),
        shipping_cost: Number(l.shipping_cost || 0),
      })).filter(l => (l.product_id && Number.isInteger(l.qty) && l.qty >= 1 && !isNaN(l.product_cost)))

      if (cleaned.length === 0) return json(400, { error: 'No valid lines (need product_id, integer qty>=1, cost)' })

      // Insert header; order_no is auto via trigger
      const res = await sql`
        insert into orders_suppliers (
          tenant_id, supplier_id, order_no, order_date, est_delivery_date,
          delivered, received, in_customs, delivery_date, discount,
          product_cost, shipping_cost, notes
        )
        values (
          ${tenantId}, ${supplier_id}, default,
          ${order_date}, ${est_delivery_date},
          ${!!delivered}, ${!!received}, ${!!in_customs},
          null, 0, 0, 0, ${notes}
        )
        returning id
      `
      
      const orderId = res?.[0]?.id
      if (!orderId) {
        return json(500, { error: 'Failed to create supplier order' })
      }

      // Batch insert lines
      for (const line of cleaned) {
        await sql`
          insert into order_items_suppliers (tenant_id, order_id, product_id, qty, product_cost, shipping_cost)
          values (
            ${tenantId},
            ${orderId},
            ${line.product_id},
            ${line.qty},
            ${line.product_cost},
            ${line.shipping_cost}
          )
        `
      }

      return json(200, { order_id: orderId })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (err) {
    console.error('order-supplier error:', err)
    return json(500, { error: String(err?.message || err) })
  }
}
