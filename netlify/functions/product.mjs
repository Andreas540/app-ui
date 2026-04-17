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
      SELECT id, name, cost, category, duration_minutes, price_amount, currency, external_service_id
      FROM products
      WHERE tenant_id = ${TENANT_ID}
      ORDER BY category, name
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
    const category = body.category === 'service' ? 'service' : 'product';

    if (!name) return cors(400, { error: 'name is required' });
    if (!Number.isFinite(costNum) || costNum < 0) {
      return cors(400, { error: 'cost must be a number ≥ 0' });
    }

    // Service-specific fields (ignored for products)
    const durationMinutes = category === 'service' && body.duration_minutes != null
      ? Math.max(1, parseInt(body.duration_minutes, 10) || 60)
      : null
    const priceAmount = category === 'service' && body.price_amount != null
      ? Number(body.price_amount)
      : null

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
if (authz.error) return cors(403, { error: authz.error });

const TENANT_ID = authz.tenantId;

    // Create product (keep products.cost in sync with latest)
    const rows = await sql`
      INSERT INTO products (tenant_id, name, cost, category, duration_minutes, price_amount)
      VALUES (${TENANT_ID}, ${name}, ${costNum}, ${category}, ${durationMinutes}, ${priceAmount})
      RETURNING id, name, cost, category, duration_minutes, price_amount
    `;
    const product = rows[0];

    // For services, also mirror into services table (bookings.service_id FK references services.id)
    if (category === 'service') {
      await sql`
        INSERT INTO services (id, tenant_id, name, service_type, duration_minutes, price_amount, currency)
        VALUES (
          ${product.id}, ${TENANT_ID}, ${name}, 'manual',
          ${durationMinutes ?? 60},
          ${priceAmount ?? costNum},
          'USD'
        )
        ON CONFLICT (id) DO NOTHING
      `
    }

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
    const newDurationMinutes = body.duration_minutes != null ? Math.max(1, parseInt(body.duration_minutes, 10) || 60) : undefined;
    const newPriceAmount    = body.price_amount === null ? null : body.price_amount != null ? Number(body.price_amount) : undefined;

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

    // Get current record
    const current = await sql`
      SELECT cost, category, external_service_id
      FROM products
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
      LIMIT 1
    `;
    if (current.length === 0) return cors(404, { error: 'Product not found' });

    // Only SimplyBook-synced services have their name locked
    const isService = current[0].category === 'service';
    const isSyncedService = isService && !!current[0].external_service_id;
    const effectiveName = isSyncedService ? undefined : name;

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
  SET name             = COALESCE(${effectiveName ?? null}, name),
      cost             = CASE WHEN ${shouldUpdateProductCostNow && hasNewCost} THEN ${newCostNum} ELSE cost END,
      duration_minutes = CASE WHEN ${newDurationMinutes !== undefined} THEN ${newDurationMinutes ?? null} ELSE duration_minutes END,
      price_amount     = CASE WHEN ${newPriceAmount !== undefined} THEN ${newPriceAmount ?? null} ELSE price_amount END
  WHERE tenant_id = ${TENANT_ID} AND id = ${id}
  RETURNING id, name, cost, duration_minutes, price_amount
`;
    if (updatedRows.length === 0) return cors(404, { error: 'Not found' });

    // Keep services table in sync for manual services (SimplyBook-synced services are updated by the sync job)
    if (isService && !isSyncedService) {
      await sql`
        UPDATE services
        SET name             = COALESCE(${effectiveName ?? null}, name),
            price_amount     = CASE WHEN ${shouldUpdateProductCostNow && hasNewCost} THEN ${newCostNum}
                                    WHEN ${newPriceAmount !== undefined} THEN ${newPriceAmount ?? null}
                                    ELSE price_amount END,
            duration_minutes = CASE WHEN ${newDurationMinutes !== undefined} THEN ${newDurationMinutes ?? null} ELSE duration_minutes END
        WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
    }

    // Handle history updates
    // IMPORTANT: applyToHistory should work even if cost didn't change
    // (user wants to apply CURRENT cost to all historical orders)
    if (applyToHistory && hasNewCost) {
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
    } else if (costChanged) {
      // Cost changed but NOT applying to history
      if (effectiveDate) {
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


