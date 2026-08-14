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
        
        // Get order items with stage quantities
        const items = await sql`
          select
            ois.id,
            ois.product_id,
            p.name as product_name,
            ois.qty,
            ois.qty_shipped,
            ois.qty_in_customs,
            ois.qty_received,
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

      // Snapshot stage quantities per product before delete so they survive the reinsert
      const stageSnapshot = await sql`
        SELECT product_id,
          LEAST(qty_shipped,    qty) AS shipped,
          LEAST(qty_in_customs, qty) AS customs,
          LEAST(qty_received,   qty) AS received
        FROM order_items_suppliers
        WHERE tenant_id = ${tenantId} AND order_id = ${id}
      `
      const stageMap = Object.fromEntries(
        stageSnapshot.map(r => [String(r.product_id), {
          shipped:  Number(r.shipped),
          customs:  Number(r.customs),
          received: Number(r.received),
        }])
      )

      // Capture old product IDs before deletion so we can recalculate their avg cost too
      const oldProductIds = stageSnapshot.map(r => r.product_id)

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

      // Restore stage quantities.
      // If an order-level boolean flag is set, sync all items to full qty for that stage.
      // Otherwise restore the per-product snapshot (capped at new qty in case qty changed).
      if (!!received) {
        await sql`UPDATE order_items_suppliers SET qty_received=qty, qty_shipped=0, qty_in_customs=0 WHERE order_id=${id} AND tenant_id=${tenantId}`
      } else if (!!in_customs) {
        await sql`UPDATE order_items_suppliers SET qty_in_customs=qty, qty_shipped=0, qty_received=0 WHERE order_id=${id} AND tenant_id=${tenantId}`
      } else if (!!delivered) {
        await sql`UPDATE order_items_suppliers SET qty_shipped=qty, qty_in_customs=0, qty_received=0 WHERE order_id=${id} AND tenant_id=${tenantId}`
      } else {
        for (const [productId, snap] of Object.entries(stageMap)) {
          if (snap.shipped === 0 && snap.customs === 0 && snap.received === 0) continue
          await sql`
            UPDATE order_items_suppliers
            SET qty_shipped    = LEAST(${snap.shipped},  qty),
                qty_in_customs = LEAST(${snap.customs},  qty),
                qty_received   = LEAST(${snap.received}, qty)
            WHERE order_id = ${id} AND tenant_id = ${tenantId} AND product_id = ${productId}
          `
        }
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

    // -------- PATCH: update per-item stage quantities ----------
    if (method === 'PATCH') {
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf-8')
        : (event.body || '{}')
      const body = JSON.parse(rawBody)
      const { order_id, items } = body
      if (!order_id || !Array.isArray(items)) return json(400, { error: 'Missing order_id or items' })

      // Verify order belongs to this tenant
      const orderCheck = await sql`
        SELECT id FROM orders_suppliers WHERE id = ${order_id} AND tenant_id = ${tenantId} LIMIT 1
      `
      if (orderCheck.length === 0) return json(404, { error: 'Order not found' })

      // Get tenant timezone once
      const tzRow = await sql`SELECT COALESCE(default_timezone, 'UTC') AS tz FROM tenants WHERE id = ${tenantId} LIMIT 1`
      const tz = tzRow[0]?.tz || 'UTC'

      // Snapshot qty_received totals BEFORE updates (needed for delta calculation)
      const beforeTotals = await sql`
        SELECT ois.product_id, p.name AS product_name, SUM(ois.qty_received) AS total_received
        FROM order_items_suppliers ois
        JOIN products p ON p.id = ois.product_id
        WHERE ois.order_id = ${order_id} AND ois.tenant_id = ${tenantId}
        GROUP BY ois.product_id, p.name
      `

      // Update each item's stage quantities
      for (const item of items) {
        const itemId = item.id
        const newShipped    = Math.max(0, Number(item.qty_shipped)    || 0)
        const newInCustoms  = Math.max(0, Number(item.qty_in_customs) || 0)
        const newReceived   = Math.max(0, Number(item.qty_received)   || 0)

        const current = await sql`
          SELECT ois.qty, ois.product_id, p.name AS product_name
          FROM order_items_suppliers ois
          JOIN products p ON p.id = ois.product_id
          WHERE ois.id = ${itemId} AND ois.tenant_id = ${tenantId} AND ois.order_id = ${order_id}
          LIMIT 1
        `
        if (current.length === 0) continue
        const { qty: totalQty } = current[0]

        if (newShipped + newInCustoms + newReceived > Number(totalQty)) {
          return json(400, { error: `Stage quantities exceed ordered qty for item ${itemId}` })
        }

        await sql`
          UPDATE order_items_suppliers
          SET qty_shipped    = ${newShipped},
              qty_in_customs = ${newInCustoms},
              qty_received   = ${newReceived}
          WHERE id = ${itemId} AND tenant_id = ${tenantId} AND order_id = ${order_id}
        `
      }

      // Append delta 'S' records to the warehouse ledger.
      // warehouse_deliveries.order_id has a FK to customer orders, not supplier orders,
      // so we can't tag records by supplier order. Instead we record the delta between
      // the old and new qty_received totals per product — the ledger stays correct.
      const afterTotals = await sql`
        SELECT ois.product_id, p.name AS product_name, SUM(ois.qty_received) AS total_received
        FROM order_items_suppliers ois
        JOIN products p ON p.id = ois.product_id
        WHERE ois.order_id = ${order_id} AND ois.tenant_id = ${tenantId}
        GROUP BY ois.product_id, p.name
      `
      const beforeMap = Object.fromEntries(
        beforeTotals.map(r => [r.product_id, { total: Number(r.total_received), name: r.product_name }])
      )
      const afterMap = Object.fromEntries(
        afterTotals.map(r => [r.product_id, { total: Number(r.total_received), name: r.product_name }])
      )
      const allProductIds = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])
      for (const productId of allProductIds) {
        const delta = (afterMap[productId]?.total || 0) - (beforeMap[productId]?.total || 0)
        if (delta === 0) continue
        const productName = (afterMap[productId] || beforeMap[productId]).name
        await sql`
          INSERT INTO warehouse_deliveries (tenant_id, date, supplier_manual_delivered, product, qty, product_id)
          VALUES (
            ${tenantId},
            (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date,
            'S',
            ${productName},
            ${delta},
            ${productId}
          )
        `
      }

      // Auto-set/clear status date fields based on whether aggregate quantities
      // now match the full ordered qty for all items.
      const orderAgg = await sql`
        SELECT
          SUM(ois.qty)          AS agg_qty,
          SUM(ois.qty_received)   AS agg_received,
          SUM(ois.qty_in_customs) AS agg_in_customs,
          SUM(ois.qty_shipped)    AS agg_shipped
        FROM order_items_suppliers ois
        WHERE ois.order_id = ${order_id} AND ois.tenant_id = ${tenantId}
      `
      const agg = orderAgg[0]
      const totalQty      = Number(agg.agg_qty)       || 0
      const totalReceived = Number(agg.agg_received)   || 0
      const totalCustoms  = Number(agg.agg_in_customs) || 0
      const totalShipped  = Number(agg.agg_shipped)    || 0
      const today = `(CURRENT_TIMESTAMP AT TIME ZONE '${tz}')::date`

      const fullyReceived  = totalQty > 0 && totalReceived >= totalQty
      const fullyInCustoms = totalQty > 0 && totalCustoms  >= totalQty && totalReceived === 0
      const fullyShipped   = totalQty > 0 && totalShipped  >= totalQty && totalReceived === 0 && totalCustoms === 0

      await sql`
        UPDATE orders_suppliers SET
          received        = ${fullyReceived},
          received_date   = CASE WHEN ${fullyReceived}  AND received_date IS NULL THEN (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date
                                 WHEN ${!fullyReceived} THEN NULL
                                 ELSE received_date END,
          in_customs      = ${fullyInCustoms},
          in_customs_date = CASE WHEN ${fullyInCustoms}  AND in_customs_date IS NULL THEN (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date
                                 WHEN ${!fullyInCustoms} THEN NULL
                                 ELSE in_customs_date END,
          delivered       = ${fullyShipped},
          delivery_date   = CASE WHEN ${fullyShipped}  AND delivery_date IS NULL THEN (CURRENT_TIMESTAMP AT TIME ZONE ${tz})::date
                                 WHEN ${!fullyShipped} THEN NULL
                                 ELSE delivery_date END
        WHERE id = ${order_id} AND tenant_id = ${tenantId}
      `

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
