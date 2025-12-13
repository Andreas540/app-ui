// netlify/functions/scheduled-update-product-costs.mjs

export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env

    if (!DATABASE_URL) {
      console.error('DATABASE_URL missing')
      return { statusCode: 500, body: 'DATABASE_URL missing' }
    }

    const sql = neon(DATABASE_URL)

    // Tenant-safe: for each product, pick latest effective cost from the SAME tenant
    await sql`
      UPDATE public.products p
      SET cost = x.cost
      FROM LATERAL (
        SELECT pch.cost
        FROM public.product_cost_history pch
        WHERE pch.tenant_id = p.tenant_id
          AND pch.product_id = p.id
          AND pch.effective_from <= NOW()
        ORDER BY pch.effective_from DESC
        LIMIT 1
      ) x
      WHERE x.cost IS NOT NULL
    `

    console.log('Product costs updated successfully (tenant-safe)')
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Product costs updated' }),
    }
  } catch (e) {
    console.error('Error updating product costs:', e)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(e?.message || e) }),
    }
  }
}