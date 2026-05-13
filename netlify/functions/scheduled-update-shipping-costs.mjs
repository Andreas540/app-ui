// netlify/functions/scheduled-update-shipping-costs.mjs
// Runs on a schedule to apply shipping cost history entries whose effective_from has arrived.
// Mirrors the logic of scheduled-update-product-costs.mjs.

export async function handler() {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env

    if (!DATABASE_URL) {
      console.error('DATABASE_URL missing')
      return { statusCode: 500, body: 'DATABASE_URL missing' }
    }

    const sql = neon(DATABASE_URL)

    // For each customer, apply the most recent shipping_cost_history entry
    // whose effective_from is on or before now.
    await sql`
      UPDATE customers c
      SET shipping_cost = (
        SELECT sch.shipping_cost
        FROM shipping_cost_history sch
        WHERE sch.tenant_id = c.tenant_id
          AND sch.customer_id = c.id
          AND sch.effective_from <= NOW()
        ORDER BY sch.effective_from DESC
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1
        FROM shipping_cost_history sch
        WHERE sch.tenant_id = c.tenant_id
          AND sch.customer_id = c.id
          AND sch.effective_from <= NOW()
      )
    `

    console.log('Shipping costs updated successfully')
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Shipping costs updated' }),
    }
  } catch (e) {
    console.error('Error updating shipping costs:', e)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(e?.message || e) }),
    }
  }
}
