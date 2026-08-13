/**
 * Calculates the product cost for a given cost_method by querying supplier order history.
 *
 * Methods:
 *   avg_3m  — weighted average of supplier order lines in the last 3 months
 *   avg_6m  — weighted average of supplier order lines in the last 6 months
 *   avg_12m — weighted average of supplier order lines in the last 12 months
 *   last_purchase — unit cost from the single most recent supplier order line
 *
 * Returns a number (rounded to 3 decimal places) or null if no qualifying data exists.
 */
export async function calcSupplierAvgCost(sql, tenantId, productId, method) {
  if (method === 'last_purchase') {
    const rows = await sql`
      SELECT ois.product_cost
      FROM order_items_suppliers ois
      JOIN orders_suppliers os ON os.id = ois.order_id
      WHERE os.tenant_id = ${tenantId}::uuid
        AND ois.product_id = ${productId}::uuid
        AND ois.product_cost IS NOT NULL
        AND ois.product_cost > 0
      ORDER BY os.order_date DESC, os.created_at DESC
      LIMIT 1
    `
    if (!rows.length || rows[0].product_cost == null) return null
    return Number(Number(rows[0].product_cost).toFixed(3))
  }

  const months = method === 'avg_3m' ? 3 : method === 'avg_6m' ? 6 : 12

  const rows = await sql`
    SELECT
      COALESCE(SUM(ois.qty * ois.product_cost), 0) AS total_cost,
      COALESCE(SUM(ois.qty), 0)                    AS total_qty
    FROM order_items_suppliers ois
    JOIN orders_suppliers os ON os.id = ois.order_id
    WHERE os.tenant_id = ${tenantId}::uuid
      AND ois.product_id = ${productId}::uuid
      AND ois.product_cost IS NOT NULL
      AND ois.product_cost > 0
      AND ois.qty > 0
      AND os.order_date >= (CURRENT_DATE - (${months} * INTERVAL '1 month'))
  `

  const { total_cost, total_qty } = rows[0]
  if (!total_qty || Number(total_qty) === 0) return null

  return Number((Number(total_cost) / Number(total_qty)).toFixed(3))
}

/**
 * Writes a new product_cost_history entry with source = 'supplier_avg'.
 * Effective_from is a DATE string (YYYY-MM-DD).
 * The existing DB trigger propagates the change to order_items.product_cost.
 */
export async function writeAvgCostHistory(sql, tenantId, productId, cost, effectiveFrom) {
  await sql`
    INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from, source)
    VALUES (
      ${tenantId}::uuid,
      ${productId}::uuid,
      ${cost},
      ${effectiveFrom}::timestamptz,
      'supplier_avg'
    )
  `
}
