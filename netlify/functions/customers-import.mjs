// netlify/functions/customers-import.mjs
// POST /api/customers-import — authenticated, tenant-scoped bulk customer upsert.
// Body: { rows: MappedRow[], customFieldDefs: { field_key, label }[] }
// Response: { ok, created, updated, skipped, errors: [{ row, message }] }

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')  return getCustomFieldDefs(event)
  if (event.httpMethod === 'POST') return importCustomers(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCustomFieldDefs(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const tenantId = authz.tenantId
    if (!tenantId) return cors(403, { error: 'Tenant required' })
    const defs = await sql`
      SELECT field_key, label FROM tenant_custom_field_defs
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY label ASC
    `.catch(() => [])
    return cors(200, { ok: true, defs })
  } catch (e) {
    return cors(500, { error: String(e?.message || e) })
  }
}

async function importCustomers(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const tenantId = authz.tenantId
    if (!tenantId) return cors(403, { error: 'Tenant required' })

    let body
    try { body = JSON.parse(event.body || '{}') } catch { return cors(400, { error: 'Invalid JSON' }) }

    const rows = Array.isArray(body.rows) ? body.rows : []
    const customFieldDefs = Array.isArray(body.customFieldDefs) ? body.customFieldDefs : []

    if (rows.length === 0)    return cors(400, { error: 'No rows provided' })
    if (rows.length > 5000)   return cors(400, { error: 'Maximum 5,000 rows per import' })

    // Ensure schema additions exist
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb`.catch(() => {})
    await sql`
      CREATE TABLE IF NOT EXISTS tenant_custom_field_defs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, field_key)
      )
    `.catch(() => {})

    // Determine which "direct" customer_type this tenant uses (BLV = legacy, Direct = everyone else)
    const blvCheck = await sql`
      SELECT 1 FROM customers WHERE tenant_id = ${tenantId}::uuid AND customer_type = 'BLV' LIMIT 1
    `
    const directType = blvCheck.length > 0 ? 'BLV' : 'Direct'

    // Upsert any new custom field definitions
    for (const def of customFieldDefs) {
      const key = str(def.field_key)
      const label = str(def.label)
      if (!key || !label) continue
      await sql`
        INSERT INTO tenant_custom_field_defs (tenant_id, field_key, label)
        VALUES (${tenantId}::uuid, ${key}, ${label})
        ON CONFLICT (tenant_id, field_key) DO UPDATE SET label = EXCLUDED.label
      `.catch(() => {})
    }

    let created = 0
    let updated = 0
    let skipped = 0
    const errors = []
    const BATCH = 200

    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH) {
      const batch = rows.slice(batchStart, batchStart + BATCH)

      for (let i = 0; i < batch.length; i++) {
        const row = batch[i]
        const rowNo = batchStart + i + 1

        try {
          const name = str(row.name)
          if (!name) {
            errors.push({ row: rowNo, message: 'Name is required' })
            skipped++
            continue
          }

          const email      = 'email'         in row ? (str(row.email)      || null) : undefined
          const phone      = 'phone'         in row ? (str(row.phone)      || null) : undefined
          const compName   = 'company_name'  in row ? (str(row.company_name) || null) : undefined
          const addr1      = 'address1'      in row ? (str(row.address1)   || null) : undefined
          const addr2      = 'address2'      in row ? (str(row.address2)   || null) : undefined
          const city       = 'city'          in row ? (str(row.city)       || null) : undefined
          const state      = 'state'         in row ? (str(row.state)      || null) : undefined
          const postalCode = 'postal_code'   in row ? (str(row.postal_code)|| null) : undefined
          const country    = 'country'       in row ? (str(row.country)    || null) : undefined
          const custType   = 'customer_type' in row ? normalizeType(row.customer_type, directType) : undefined
          const shipCost   = 'shipping_cost' in row ? (parseFloat(str(row.shipping_cost)) || 0) : undefined
          const customFields = row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {}

          // ── Dedup: email first, then phone ──────────────────────────────────
          let existingId = null
          if (email) {
            const r = await sql`
              SELECT id FROM customers
              WHERE tenant_id = ${tenantId}::uuid AND lower(email) = lower(${email})
              LIMIT 1
            `
            if (r.length) existingId = r[0].id
          }
          if (!existingId && phone) {
            const r = await sql`
              SELECT id FROM customers
              WHERE tenant_id = ${tenantId}::uuid AND phone = ${phone}
              LIMIT 1
            `
            if (r.length) existingId = r[0].id
          }

          if (existingId) {
            // ── UPDATE: fetch existing, merge, write back ────────────────────
            const cur = (await sql`
              SELECT name, email, phone, company_name, address1, address2, city, state,
                     postal_code, country, customer_type, shipping_cost, custom_fields
              FROM customers
              WHERE id = ${existingId} AND tenant_id = ${tenantId}::uuid
              LIMIT 1
            `)[0]

            const mergedCustomFields = {
              ...(cur.custom_fields || {}),
              ...customFields,
            }

            await sql`
              UPDATE customers SET
                name          = ${name},
                email         = ${email         !== undefined ? email         : cur.email},
                phone         = ${phone         !== undefined ? phone         : cur.phone},
                company_name  = ${compName      !== undefined ? compName      : cur.company_name},
                address1      = ${addr1         !== undefined ? addr1         : cur.address1},
                address2      = ${addr2         !== undefined ? addr2         : cur.address2},
                city          = ${city          !== undefined ? city          : cur.city},
                state         = ${state         !== undefined ? state         : cur.state},
                postal_code   = ${postalCode    !== undefined ? postalCode    : cur.postal_code},
                country       = ${country       !== undefined ? country       : cur.country},
                customer_type = ${custType      !== undefined ? custType      : cur.customer_type},
                shipping_cost = ${shipCost      !== undefined ? shipCost      : Number(cur.shipping_cost)},
                custom_fields = ${JSON.stringify(mergedCustomFields)}::jsonb
              WHERE id = ${existingId} AND tenant_id = ${tenantId}::uuid
            `
            updated++
          } else {
            // ── INSERT ───────────────────────────────────────────────────────
            await sql`
              INSERT INTO customers
                (tenant_id, name, email, phone, company_name, address1, address2,
                 city, state, postal_code, country, customer_type, shipping_cost,
                 sms_consent, custom_fields)
              VALUES (
                ${tenantId}::uuid,
                ${name},
                ${email         ?? null},
                ${phone         ?? null},
                ${compName      ?? null},
                ${addr1         ?? null},
                ${addr2         ?? null},
                ${city          ?? null},
                ${state         ?? null},
                ${postalCode    ?? null},
                ${country       ?? null},
                ${custType      ?? directType},
                ${shipCost      ?? 0},
                false,
                ${JSON.stringify(customFields)}::jsonb
              )
            `
            created++
          }
        } catch (err) {
          console.error(`customers-import row ${rowNo} error:`, err)
          errors.push({ row: rowNo, message: String(err?.message || err) })
          skipped++
        }
      }
    }

    return cors(200, { ok: true, created, updated, skipped, errors })
  } catch (e) {
    console.error('customers-import error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function str(v) {
  return typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : '')
}

function normalizeType(val, directType) {
  const s = str(val).toLowerCase()
  if (s === 'partner') return 'Partner'
  return directType
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-active-tenant',
    },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
