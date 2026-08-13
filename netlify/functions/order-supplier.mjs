// netlify/functions/order-supplier.mjs
import { neon }             from '@neondatabase/serverless'
import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'
import { calcSupplierAvgCost, writeAvgCostHistory } from './utils/calc-supplier-avg-cost.mjs'

const json = (code, obj) => ({
  statusCode: code,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(obj),
})

export const handler = withErrorLogging('order_supplier', async (event) => {
    const method = event.httpMethod || 'GET'
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return json(204, {})
    }
    
    const sql = neon(process.env.DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return json(403, { error: authz.error })
    const tenantId = authz.tenantId

    // -------- GET ----------
    if (method === 'GET') {
      const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`)
      const fn = url.searchParams.get('fn')
      const id = url.searchParams.get('id')

      // Get single order by ID
      if (id) {
        const orderRows = await sql`
          select 
            os.id,
            os.order_no,
            os.supplier_id,
            s.name as supplier_name,
            os.order_date,
            os.est_delivery_date,
            os.delivered,
            os.delivery_date,
            os.received,
            os.received_date,
            os.in_customs,
            os.in_customs_date,
            os.notes
          from orders_suppliers os
          join suppliers s on s.id = os.supplier_id
          where os.tenant_id = ${tenantId}
            and os.id = ${id}
          limit 1
        `
        
        if (orderRows.length === 0) {
          return json(404, { error: 'Order not found' })
        }
        
        const order = orderRows[0]
        
        // Get order items
        const items = await sql`
          select
            ois.id,
            ois.product_id,
            p.name as product_name,
            ois.qty,
            ois.product_cost,
            ois.shipping_cost
          from order_items_suppliers ois
          join products p on p.id = ois.product_id
          where ois.tenant_id = ${tenantId}
            and ois.order_id = ${id}
          order by ois.created_at asc
        `
        
        return json(200, { order, items })
      }

      // Last-cost lookup
      if (fn === 'last-cost') {
        const supplier_id = url.searchParams.get('supplier_id')
        const product_id  = url.searchParams.get('product_id')
        if (!supplier_id || !product_id) return json(400, { error: 'Missing supplier_id or product_id' })

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
      
      return json(400, { error: 'Unknown or missing parameter' })
    }

    // -------- POST: create header + lines ----------
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

      const cleaned = lines.map((l) => ({
        product_id: l.product_id ? String(l.product_id) : null,
        qty: Number(l.qty || 0),
        product_cost: Number(l.product_cost || 0),
        shipping_cost: Number(l.shipping_cost || 0),
      })).filter(l => (l.product_id && Number.isInteger(l.qty) && l.qty >= 1 && !isNaN(l.product_cost)))

      if (cleaned.length === 0) return json(400, { error: 'No valid lines' })

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
      if (!orderId) return json(500, { error: 'Failed to create supplier order' })

      for (const line of cleaned) {
        await sql`
          insert into order_items_suppliers (tenant_id, order_id, product_id, qty, product_cost, shipping_cost)
          values (
            ${tenantId}, ${orderId}, ${line.product_id}, ${line.qty}, ${line.product_cost}, ${line.shipping_cost}
          )
        `
      }

      await updateAvgCostForProducts(sql, tenantId, cleaned.map(l => l.product_id))
      return json(200, { order_id: orderId })
    }

    // -------- PUT: update order ----------
    if (method === 'PUT') {
      const body = JSON.parse(event.body || '{}')
      const {
        id,
        supplier_id,
        delivered = false,
        delivery_date = null,
        received = false,
        received_date = null,
        in_customs = false,
        in_customs_date = null,
        order_date = null,
        est_delivery_date = null,
        notes = null,
        lines = [],
      } = body

      if (!id) return json(400, { error: 'Missing order id' })
      if (!supplier_id) return json(400, { error: 'Missing supplier_id' })
      if (!Array.isArray(lines) || lines.length === 0) return json(400, { error: 'No lines provided' })

      // Update order header (manually set dates if provided, otherwise let trigger handle it)
      await sql`
        update orders_suppliers
        set
          order_date = ${order_date},
          est_delivery_date = ${est_delivery_date},
          delivered = ${!!delivered},
          delivery_date = ${delivered && delivery_date ? delivery_date : null},
          received = ${!!received},
          received_date = ${received && received_date ? received_date : null},
          in_customs = ${!!in_customs},
          in_customs_date = ${in_customs && in_customs_date ? in_customs_date : null},
          notes = ${notes}
        where tenant_id = ${tenantId}
          and id = ${id}
      `

      // Capture old product IDs before deletion so we can recalculate their avg cost too
      const oldLines = await sql`
        SELECT DISTINCT product_id FROM order_items_suppliers
        WHERE tenant_id = ${tenantId} AND order_id = ${id}
      `
      const oldProductIds = oldLines.map(r => r.product_id)

      // Delete existing order items
      await sql`
        delete from order_items_suppliers
        where tenant_id = ${tenantId}
          and order_id = ${id}
      `

      // Clean and validate new lines
      const cleaned = lines.map((l) => ({
        product_id: l.product_id ? String(l.product_id) : null,
        qty: Number(l.qty || 0),
        product_cost: Number(l.product_cost || 0),
        shipping_cost: Number(l.shipping_cost || 0),
      })).filter(l => (l.product_id && Number.isInteger(l.qty) && l.qty >= 1 && !isNaN(l.product_cost)))

      if (cleaned.length === 0) return json(400, { error: 'No valid lines' })

      // Insert new lines
      for (const line of cleaned) {
        await sql`
          insert into order_items_suppliers (tenant_id, order_id, product_id, qty, product_cost, shipping_cost)
          values (
            ${tenantId}, ${id}, ${line.product_id}, ${line.qty}, ${line.product_cost}, ${line.shipping_cost}
          )
        `
      }

      const allProductIds = [...new Set([...oldProductIds, ...cleaned.map(l => l.product_id)])]
      await updateAvgCostForProducts(sql, tenantId, allProductIds, order_date)
      return json(200, { ok: true })
    }

    // -------- DELETE: remove order ----------
    if (method === 'DELETE') {
      const body = JSON.parse(event.body || '{}')
      const { id } = body

      if (!id) return json(400, { error: 'Missing order id' })

      // Capture order_date and product IDs before deletion for retroactive recalculation
      const [orderHeader, deletedLines] = await Promise.all([
        sql`SELECT order_date FROM orders_suppliers WHERE tenant_id = ${tenantId} AND id = ${id} LIMIT 1`,
        sql`SELECT DISTINCT product_id FROM order_items_suppliers WHERE tenant_id = ${tenantId} AND order_id = ${id}`,
      ])
      const affectedOrderDate = orderHeader[0]?.order_date
      const deletedProductIds = deletedLines.map(r => r.product_id)

      // Delete order items first (foreign key constraint)
      await sql`
        delete from order_items_suppliers
        where tenant_id = ${tenantId}
          and order_id = ${id}
      `

      // Delete order
      await sql`
        delete from orders_suppliers
        where tenant_id = ${tenantId}
          and id = ${id}
      `

      await updateAvgCostForProducts(sql, tenantId, deletedProductIds, affectedOrderDate)
      return json(200, { ok: true })
    }

    return json(405, { error: 'Method Not Allowed' })
})

// Recalculate and write avg cost history for products using a supplier avg method.
//
// retroactiveOrderDate: date string of the supplier order that was edited/deleted.
//   When set, stale avg-cost history entries that could have included that order
//   are deleted and replaced with a corrected entry written from the earliest
//   affected date — so historical profit figures are corrected automatically
//   via the existing DB trigger.
//   When null (new order), writes from today only (history untouched).
async function updateAvgCostForProducts(sql, tenantId, productIds, retroactiveOrderDate = null) {
  if (!productIds.length) return
  const today = new Date().toISOString() // full timestamp so avg entry sorts after same-day manual entries

  const products = await sql`
    SELECT id, cost_method FROM products
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ANY(${productIds}::uuid[])
      AND cost_method != 'manual'
  `

  for (const p of products) {
    let effectiveFrom = today

    if (retroactiveOrderDate) {
      // Find the earliest avg-cost history entry that could have included the
      // changed order in its calculation window. Conservative lookback = 12 months
      // (the maximum window). Entries from that date onward are stale.
      const earliest = await sql`
        SELECT MIN(effective_from)::date AS earliest_date
        FROM product_cost_history
        WHERE tenant_id = ${tenantId}::uuid
          AND product_id = ${p.id}::uuid
          AND source = 'supplier_avg'
          AND effective_from >= (${retroactiveOrderDate}::date - INTERVAL '12 months')
      `
      const earliestDate = earliest[0]?.earliest_date
      if (earliestDate) {
        // Remove all stale avg entries from that date forward. The new corrected
        // entry written below becomes the single source of truth for that range,
        // and the DB trigger propagates it to order_items.product_cost.
        await sql`
          DELETE FROM product_cost_history
          WHERE tenant_id = ${tenantId}::uuid
            AND product_id = ${p.id}::uuid
            AND source = 'supplier_avg'
            AND effective_from >= ${earliestDate}
        `
        effectiveFrom = new Date(earliestDate).toISOString().slice(0, 10)
      }
    }

    const cost = await calcSupplierAvgCost(sql, tenantId, p.id, p.cost_method)
    if (cost !== null) {
      await writeAvgCostHistory(sql, tenantId, p.id, cost, effectiveFrom)
      console.log(`Avg cost updated: product=${p.id} method=${p.cost_method} cost=${cost} effective_from=${effectiveFrom}${retroactiveOrderDate ? ' (retroactive)' : ''}`)
    }
  }
}
