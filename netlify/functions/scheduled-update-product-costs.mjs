// netlify/functions/scheduled-update-product-costs.mjs

export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    
    if (!DATABASE_URL) {
      console.error('DATABASE_URL missing');
      return { statusCode: 500, body: 'DATABASE_URL missing' };
    }

    const sql = neon(DATABASE_URL);

    // Update all products with their current effective cost
    await sql`
      UPDATE products p
      SET cost = (
        SELECT pch.cost
        FROM product_cost_history pch
        WHERE pch.product_id = p.id
          AND pch.effective_from <= NOW()
        ORDER BY pch.effective_from DESC
        LIMIT 1
      )
    `;

    console.log('Product costs updated successfully');
    return { 
      statusCode: 200, 
      body: JSON.stringify({ success: true, message: 'Product costs updated' })
    };
  } catch (e) {
    console.error('Error updating product costs:', e);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: String(e?.message || e) })
    };
  }
}