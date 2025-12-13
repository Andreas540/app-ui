// netlify/functions/product.mjs

import { resolveAuthz } from './utils/auth.mjs'

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
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

const sql = neon(DATABASE_URL);

const authz = await resolveAuthz({ sql, event });
if (authz.error) return cors(403, { error: authz.error });

const TENANT_ID = authz.tenantId;

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
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    const costNum = Number(body.cost);

    if (!name) return cors(400, { error: 'name is required' });
    if (!Number.isFinite(costNum) || costNum < 0) {
      return cors(400, { error: 'cost must be a number ≥ 0' });
    }

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
if (authz.error) return cors(403, { error: authz.error });

const TENANT_ID = authz.tenantId;

    // Create product (keep products.cost in sync with latest)
    const rows = await sql`
      INSERT INTO products (tenant_id, name, cost)
      VALUES (${TENANT_ID}, ${name}, ${costNum})
      RETURNING id, name, cost
    `;
    const product = rows[0];

    // Seed history at "now"
    await sql`
  INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from)
  VALUES (${TENANT_ID}, ${product.id}, ${costNum}, now())
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
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const id = (body.id || '').trim();
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const effectiveDate = body.effective_date;

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

    const hasNewCost = newCostNum !== undefined;

    if (!id) return cors(400, { error: 'id is required' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
if (authz.error) return cors(403, { error: authz.error });

const TENANT_ID = authz.tenantId;

    // Get current cost to check if it changed
    const current = await sql`
      SELECT cost
      FROM products
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `;
    if (current.length === 0) return cors(404, { error: 'Product not found' });

    const currentCost = Number(current[0].cost);
    const costChanged = newCostNum !== undefined && newCostNum !== currentCost;

    // Determine if we should update products.cost immediately
    let shouldUpdateProductCostNow = false;
    
    if (costChanged) {
      if (applyToHistory) {
        // Applying to all history = effective immediately
        shouldUpdateProductCostNow = true;
      } else if (effectiveDate) {
        // Check if effective date is today or in the past
        const effectiveDateObj = new Date(effectiveDate + 'T00:00:00Z');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        shouldUpdateProductCostNow = effectiveDateObj <= today;
      } else {
        // No specific date = from next order = effective now
        shouldUpdateProductCostNow = true;
      }
    }

    // Update product record
    const updatedRows = await sql`
  UPDATE products
  SET name = COALESCE(${name}, name),
      cost = CASE
        WHEN ${shouldUpdateProductCostNow && hasNewCost} THEN ${newCostNum}
        ELSE cost
      END
  WHERE tenant_id = ${TENANT_ID} AND id = ${id}
  RETURNING id, name, cost
`;
    if (updatedRows.length === 0) return cors(404, { error: 'Not found' });

    // If cost changed, add history entry
    if (costChanged) {
      if (applyToHistory) {
        // Delete all previous history entries for this product
        await sql`
  DELETE FROM product_cost_history
  WHERE tenant_id = ${TENANT_ID}
    AND product_id = ${id}
`
        // Insert single entry backdated to beginning - applies to all orders
        await sql`
  INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from)
  VALUES (
  ${TENANT_ID},
  ${id},
  ${newCostNum},
  (('1970-01-01'::date)::timestamp AT TIME ZONE 'America/New_York')
)
`
      } else if (effectiveDate) {
        // Insert entry with specific date
        await sql`
  INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from)
  VALUES (
    ${TENANT_ID},
    ${id},
    ${newCostNum},
    ((${effectiveDate}::date)::timestamp AT TIME ZONE 'America/New_York')
  )
`
      } else {
        // Normal case: add new entry with current timestamp (valid from next order)
        await sql`
  INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from)
  VALUES (${TENANT_ID}, ${id}, ${newCostNum}, NOW())
`
      }
    }

    return cors(200, {
      ok: true,
      product: updatedRows[0],
      applied_to_history: applyToHistory && costChanged
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
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}


