// netlify/functions/product.mjs

import { resolveAuthz }     from './utils/auth.mjs'
import { withErrorLogging } from './utils/with-error-logging.mjs'

export const handler = withErrorLogging('product', async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'GET')  return list(event);
  if (event.httpMethod === 'POST')   return create(event);
  if (event.httpMethod === 'PUT')    return update(event);
  if (event.httpMethod === 'DELETE') return deleteProduct(event);
  return cors(405, { error: 'Method not allowed' });
})

async function list(event) {
    const { neon } = await import('@neondatabase/serverless');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

const sql = neon(DATABASE_URL);

const authz = await resolveAuthz({ sql, event });
if (authz.error) return cors(403, { error: authz.error });

const TENANT_ID = authz.tenantId;

    await sql`
      CREATE TABLE IF NOT EXISTS tenant_hidden_products (
        tenant_id  UUID NOT NULL,
        product_id UUID NOT NULL,
        PRIMARY KEY (tenant_id, product_id)
      )
    `.catch(() => {})

    const rows = await sql`
      SELECT id, name, cost, category, duration_minutes, price_amount, currency, external_service_id,
             product_category, product_subcategory, sku, variant, unit_tracking, cost_method,
             (image_data IS NOT NULL AND image_data != '') AS has_image
      FROM products
      WHERE tenant_id = ${TENANT_ID}
        AND (product_kind IS NULL OR product_kind = 'standard')
        AND NOT EXISTS (
          SELECT 1 FROM tenant_hidden_products thp
          WHERE thp.tenant_id = ${TENANT_ID} AND thp.product_id = id
        )
      ORDER BY category, name
    `;
    return cors(200, { products: rows });
}

async function create(event) {
    const { neon } = await import('@neondatabase/serverless');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    const costNum = Number(body.cost);
    const category = ['service', 'material'].includes(body.category) ? body.category : 'product';

    if (!name) return cors(400, { error: 'name is required' });
    if (!Number.isFinite(costNum) || costNum < 0) {
      return cors(400, { error: 'cost must be a number ≥ 0' });
    }

    // Service-specific fields (ignored for products)
    const durationMinutes = category === 'service' && body.duration_minutes != null
      ? Math.max(1, parseInt(body.duration_minutes, 10) || 60)
      : null
    const priceAmount = body.price_amount != null
      ? Number(body.price_amount)
      : null
    const imageData = typeof body.image_data === 'string' ? body.image_data : null
    const productCategory    = body.product_category    ? String(body.product_category)    : null
    const productSubcategory = body.product_subcategory ? String(body.product_subcategory) : null
    const sku                = body.sku                 ? String(body.sku).trim()          : null
    const variant            = body.variant             ? String(body.variant).trim()       : null
    const validModes         = ['none', 'on_promote', 'serialized_intake']
    const unitTracking       = validModes.includes(body.unit_tracking) ? body.unit_tracking : 'none'
    const validCostMethods   = ['manual', 'avg_3m', 'avg_6m', 'avg_12m', 'last_purchase']
    const costMethod         = validCostMethods.includes(body.cost_method) ? body.cost_method : 'manual'

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
if (authz.error) return cors(403, { error: authz.error });

const TENANT_ID = authz.tenantId;

    // Create product (keep products.cost in sync with latest)
    const rows = await sql`
      INSERT INTO products (tenant_id, name, cost, category, duration_minutes, price_amount, image_data, image_updated_at, product_category, product_subcategory, sku, variant, unit_tracking, cost_method)
      VALUES (${TENANT_ID}, ${name}, ${costNum}, ${category}, ${durationMinutes}, ${priceAmount}, ${imageData}, ${imageData ? new Date().toISOString() : null}, ${productCategory}, ${productSubcategory}, ${sku}, ${variant}, ${unitTracking}, ${costMethod})
      RETURNING id, name, cost, category, duration_minutes, price_amount, product_category, product_subcategory, sku, variant, unit_tracking, cost_method,
                (image_data IS NOT NULL AND image_data != '') AS has_image,
                EXTRACT(EPOCH FROM image_updated_at)::bigint AS image_version
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

    // Seed initial cost history entry (manual source — avg entries added later by supplier orders)
    await sql`
      INSERT INTO product_cost_history (tenant_id, product_id, cost, effective_from, source)
      VALUES (${TENANT_ID}, ${product.id}, ${costNum}, now(), 'manual')
    `;

    return cors(201, { product });
}

async function update(event) {
    const { neon } = await import('@neondatabase/serverless');
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const id = (body.id || '').trim();
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const effectiveDate = body.effective_date;
    const newDurationMinutes = body.duration_minutes != null ? Math.max(1, parseInt(body.duration_minutes, 10) || 60) : undefined;
    const newPriceAmount    = body.price_amount === null ? null : body.price_amount != null ? Number(body.price_amount) : undefined;

    const hasCategory    = 'product_category'    in body
    const hasSubcategory = 'product_subcategory' in body
    const hasSku         = 'sku'                 in body
    const hasVariant     = 'variant'             in body
    const hasUnitTracking = 'unit_tracking'      in body
    const newCategory    = body.product_category    ? String(body.product_category).trim()    : null
    const newSubcategory = body.product_subcategory ? String(body.product_subcategory).trim() : null
    const newSku         = body.sku     ? String(body.sku).trim()     : null
    const newVariant     = body.variant ? String(body.variant).trim() : null
    const validUnitTracking = ['none', 'on_promote', 'serialized_intake']
    const newUnitTracking = hasUnitTracking && validUnitTracking.includes(body.unit_tracking)
      ? body.unit_tracking : null

    // Strict boolean coercion for checkbox
    const rawApply = body.apply_to_history;
    const applyToHistory =
      rawApply === true || rawApply === 'true' || rawApply === 1 || rawApply === '1';

    const hasImageChange = 'image_data' in body
    const newImageData = hasImageChange ? (body.image_data === null ? null : typeof body.image_data === 'string' ? body.image_data : undefined) : undefined

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
      price_amount     = CASE WHEN ${newPriceAmount !== undefined} THEN ${newPriceAmount ?? null} ELSE price_amount END,
      image_data          = CASE WHEN ${hasImageChange && newImageData !== undefined} THEN ${newImageData ?? null} ELSE image_data END,
      image_updated_at    = CASE WHEN ${hasImageChange && newImageData !== undefined} THEN now() ELSE image_updated_at END,
      product_category    = CASE WHEN ${hasCategory}     THEN ${newCategory}      ELSE product_category    END,
      product_subcategory = CASE WHEN ${hasSubcategory}  THEN ${newSubcategory}   ELSE product_subcategory END,
      sku                 = CASE WHEN ${hasSku}          THEN ${newSku}           ELSE sku                 END,
      variant             = CASE WHEN ${hasVariant}      THEN ${newVariant}       ELSE variant             END,
      unit_tracking       = CASE WHEN ${hasUnitTracking} THEN ${newUnitTracking}  ELSE unit_tracking       END
  WHERE tenant_id = ${TENANT_ID} AND id = ${id}
  RETURNING id, name, cost, duration_minutes, price_amount,
            product_category, product_subcategory, sku, variant, unit_tracking,
            (image_data IS NOT NULL AND image_data != '') AS has_image,
            EXTRACT(EPOCH FROM image_updated_at)::bigint AS image_version
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
}

async function deleteProduct(event) {
  const { neon } = await import('@neondatabase/serverless');
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

  const sql = neon(DATABASE_URL);
  const authz = await resolveAuthz({ sql, event });
  if (authz.error) return cors(403, { error: authz.error });
  const TENANT_ID = authz.tenantId;

  const id = event.queryStringParameters?.id;
  if (!id) return cors(400, { error: 'id required' });

  const rows = await sql`SELECT category FROM products WHERE id = ${id} AND tenant_id = ${TENANT_ID} LIMIT 1`;
  if (!rows.length) return cors(404, { error: 'Not found' });
  if (rows[0].category !== 'material') return cors(400, { error: 'Only materials can be deleted' });

  // Block only if material is in an ACTIVE recipe
  const [bomRef] = await sql`
    SELECT COUNT(*) AS cnt FROM bom_items bi
    JOIN product_boms pb ON pb.id = bi.bom_id AND pb.tenant_id = ${TENANT_ID} AND pb.is_active = TRUE
    WHERE bi.input_product_id = ${id}
  `;
  if (Number(bomRef.cnt) > 0) return cors(409, { error: 'Material is used in one or more recipes. Remove it from all recipes first.' });

  const [soRef] = await sql`
    SELECT COUNT(*) AS cnt FROM order_items_suppliers WHERE product_id = ${id} LIMIT 1
  `;
  if (Number(soRef.cnt) > 0) return cors(409, { error: 'Material appears on supplier orders and cannot be deleted.' });

  // Remove orphaned bom_items from deactivated/historical recipe versions
  await sql`
    DELETE FROM bom_items bi
    USING product_boms pb
    WHERE bi.bom_id = pb.id
      AND pb.tenant_id = ${TENANT_ID}
      AND pb.is_active = FALSE
      AND bi.input_product_id = ${id}
  `;

  try {
    await sql`DELETE FROM products WHERE id = ${id} AND tenant_id = ${TENANT_ID}`;
    return cors(200, { ok: true });
  } catch (e) {
    return cors(409, { error: 'Cannot delete — material is referenced by existing records.' });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}


