// netlify/functions/product.mjs
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')  return list(event);
  if (event.httpMethod === 'POST') return create(event);
  if (event.httpMethod === 'PUT')  return update(event);
  return cors(405, { error: 'Method not allowed' });
}

async function list(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const sql = neon(DATABASE_URL);
    const rows = await sql`
      SELECT id, name, cost
      FROM products
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY name
    `;
    return cors(200, { products: rows });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function create(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    const costNum = Number(body.cost);

    if (!name) return cors(400, { error: 'name is required' });
    if (!Number.isFinite(costNum) || costNum < 0) {
      return cors(400, { error: 'cost must be a number ≥ 0' });
    }

    const sql = neon(DATABASE_URL);

    // Create product (keep products.cost in sync with latest)
    const rows = await sql`
      INSERT INTO products (tenant_id, name, cost)
      VALUES (${TENANT_ID}, ${name}, ${costNum})
      RETURNING id, name, cost
    `;
    const product = rows[0];

    // Seed history at "now"
    await sql`
      INSERT INTO product_cost_history (product_id, cost, effective_from)
      VALUES (${product.id}, ${costNum}, now())
    `;

    return cors(201, { product });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

async function update(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL, TENANT_ID } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' });

    const body = JSON.parse(event.body || '{}');
    const id = (body.id || '').trim();
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;

    // Strict boolean coercion for checkbox
    const rawApply = body.apply_to_history;
    const applyToHistory =
      rawApply === true || rawApply === 'true' || rawApply === 1 || rawApply === '1';

    let newCostNum = undefined;
    if (body.cost !== undefined) {
      const n = Number(body.cost);
      if (!Number.isFinite(n) || n < 0) return cors(400, { error: 'cost must be a number ≥ 0' });
      newCostNum = n;
    }

    if (!id) return cors(400, { error: 'id is required' });

    const sql = neon(DATABASE_URL);

    // Update product record (name and/or current cost)
    const updatedRows = await sql`
      UPDATE products
      SET name = COALESCE(${name}, name),
          cost = COALESCE(${newCostNum}, cost)
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      RETURNING id, name, cost
    `;
    if (updatedRows.length === 0) return cors(404, { error: 'Not found' });

    // If cost changed, append a history row (@ now)
    if (newCostNum !== undefined) {
      await sql`
        INSERT INTO product_cost_history (product_id, cost, effective_from)
        VALUES (${id}, ${newCostNum}, now())
      `;
    }

    // Optional: apply to historical order_items (explicit choice)
    let affected = 0;
    if (applyToHistory && newCostNum !== undefined) {
      const res = await sql`
        UPDATE order_items oi
        SET cost = ${newCostNum}
        FROM orders o
        WHERE oi.order_id = o.id
          AND o.tenant_id = ${TENANT_ID}
          AND oi.product_id = ${id}
      `;
      affected = Number(res?.count || 0);
    }

    return cors(200, {
      ok: true,
      product: updatedRows[0],
      applied_to_history: applyToHistory && newCostNum !== undefined,
      affected_rows: affected
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  };
}


