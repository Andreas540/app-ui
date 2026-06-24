// netlify/functions/tenant-admin.mjs
import jwt from 'jsonwebtoken'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'GET') return handleGet(event)
  if (event.httpMethod === 'POST') return handlePost(event)
  return cors(405, { error: 'Method not allowed' })
}

async function handleGet(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Get userId and tenantId from JWT token
    const authInfo = getUserAndTenantFromToken(event)
    if (!authInfo) return cors(403, { error: 'Authentication required' })

    const { userId, tenantId } = authInfo

    // Check if user is super_admin OR tenant_admin for this tenant
    const isSuperAdmin = await checkSuperAdmin(sql, userId)
    const isTenantAdmin = await checkTenantAdmin(sql, userId, tenantId)
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return cors(403, { error: 'Tenant admin access required' })
    }

    const action = new URL(event.rawUrl || `http://x${event.path}`).searchParams.get('action')

    // Get all users in the tenant with their permissions
    if (action === 'getTenantUsers') {
      // Get tenant's available features and geo defaults
      const tenant = await sql`
        SELECT features, default_language, default_currency, default_timezone, default_locale
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `

      const tenantFeatures = tenant[0]?.features || []

      // Get all users in this tenant
      const users = await sql`
        SELECT
          u.id,
          u.email,
          u.name,
          tm.role,
          tm.features,
          u.active,
          u.preferred_language,
          u.preferred_currency,
          u.preferred_timezone
        FROM users u
        JOIN tenant_memberships tm ON tm.user_id = u.id
        WHERE tm.tenant_id = ${tenantId}
        ORDER BY u.email ASC
      `

      return cors(200, {
        users: users,
        tenantFeatures: tenantFeatures,
        tenantGeo: {
          default_language: tenant[0]?.default_language || 'en',
          default_currency: tenant[0]?.default_currency || 'USD',
          default_timezone: tenant[0]?.default_timezone || 'UTC',
          default_locale:   tenant[0]?.default_locale   || 'en-US',
        },
      })
    }

    if (action === 'getInvoiceConfig') {
      const tenant = await sql`
        SELECT invoice_config FROM tenants WHERE id = ${tenantId} LIMIT 1
      `
      return cors(200, { invoiceConfig: tenant[0]?.invoice_config || null })
    }

    if (action === 'getBookingConfig') {
      const tenant = await sql`
        SELECT booking_slug FROM tenants WHERE id = ${tenantId} LIMIT 1
      `
      // Derive active payment provider from actual credentials, not the stale column
      const providerRow = await sql`
        SELECT provider FROM tenant_payment_providers
        WHERE tenant_id = ${tenantId} AND enabled = true
          AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
        ORDER BY CASE provider WHEN 'stripe' THEN 0 ELSE 1 END
        LIMIT 1
      `.catch(() => [])
      return cors(200, {
        slug:            tenant[0]?.booking_slug || '',
        paymentProvider: providerRow[0]?.provider || 'none',
      })
    }

    if (action === 'getUiConfig') {
      const rows = await sql`SELECT ui_config FROM tenants WHERE id = ${tenantId} LIMIT 1`
      if (rows.length === 0) return cors(404, { error: 'Tenant not found' })
      return cors(200, { uiConfig: rows[0].ui_config || {} })
    }

    if (action === 'getShippingSettings') {
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_shipping_method TEXT NOT NULL DEFAULT 'per_item'`.catch(() => {})
      const tenantRow = await sql`SELECT default_shipping_method FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`
      const customers = await sql`
        SELECT id, name, customer_type, shipping_cost
        FROM customers
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY name ASC
      `
      return cors(200, {
        defaultShippingMethod: tenantRow[0]?.default_shipping_method || 'per_item',
        customers,
      })
    }

    if (action === 'getCustomerSettings') {
      await sql`
        CREATE TABLE IF NOT EXISTS tenant_hidden_customers (
          tenant_id   UUID NOT NULL,
          customer_id UUID NOT NULL,
          PRIMARY KEY (tenant_id, customer_id)
        )
      `.catch(() => {})
      const customers = await sql`
        SELECT
          c.id,
          c.name,
          (thc.customer_id IS NOT NULL) AS hidden
        FROM customers c
        LEFT JOIN tenant_hidden_customers thc
          ON thc.customer_id = c.id AND thc.tenant_id = ${tenantId}::uuid
        WHERE c.tenant_id = ${tenantId}::uuid
        ORDER BY c.name ASC
      `
      return cors(200, { customers })
    }

    if (action === 'getCustomerRecordCounts') {
      const customerId = new URL(event.rawUrl || `http://x${event.path}`).searchParams.get('customer_id')
      if (!customerId) return cors(400, { error: 'customer_id required' })
      const [[orders], [payments], [bookings]] = await Promise.all([
        sql`SELECT COUNT(*)::int AS n FROM orders   WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`,
        sql`SELECT COUNT(*)::int AS n FROM payments WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`,
        sql`SELECT COUNT(*)::int AS n FROM bookings WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`,
      ])
      return cors(200, { orders: orders.n, payments: payments.n, bookings: bookings.n })
    }

    if (action === 'getCashReporters') {
      await sql`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS can_report_cash BOOLEAN NOT NULL DEFAULT TRUE`.catch(() => {})
      const users = await sql`
        SELECT u.id, u.name, tm.can_report_cash
        FROM users u
        JOIN tenant_memberships tm ON tm.user_id = u.id
        WHERE tm.tenant_id = ${tenantId}::uuid
        ORDER BY u.name
      `
      return cors(200, { users })
    }

    if (action === 'getOrderPageConfig') {
      await sql`CREATE TABLE IF NOT EXISTS order_page_config (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        slug TEXT UNIQUE, is_active BOOLEAN NOT NULL DEFAULT false,
        password_hash TEXT, session_minutes INTEGER,
        geo_countries TEXT[], geo_states TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`.catch(() => {})
      const rows = await sql`SELECT slug, is_active, password_hash IS NOT NULL AS has_password, session_minutes, geo_countries, geo_states FROM order_page_config WHERE tenant_id = ${tenantId}::uuid LIMIT 1`
      const tenantRow = await sql`SELECT name FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`
      const suggestedSlug = (tenantRow[0]?.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
      if (!rows.length) return cors(200, { config: { slug: suggestedSlug, is_active: false, has_password: false, session_minutes: 60, geo_countries: [], geo_states: [] } })
      return cors(200, { config: rows[0] })
    }

    if (action === 'getOrderPageProducts') {
      await sql`CREATE TABLE IF NOT EXISTS order_page_products (
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        display_price NUMERIC(12,2), display_qty INTEGER,
        is_visible BOOLEAN NOT NULL DEFAULT true,
        label_text TEXT, label_image_data TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, product_id)
      )`.catch(() => {})
      const products = await sql`
        WITH
        wd AS (
          SELECT product_id,
            SUM(CASE WHEN supplier_manual_delivered = 'P' THEN qty ELSE 0 END)        AS finished_from_p,
            SUM(CASE WHEN supplier_manual_delivered = 'D' THEN (-1 * qty) ELSE 0 END) AS outbound_qty
          FROM warehouse_deliveries WHERE tenant_id = ${tenantId}::uuid GROUP BY product_id
        ),
        lp AS (
          SELECT product_id, SUM(qty_produced) AS produced_qty
          FROM labor_production WHERE tenant_id = ${tenantId}::uuid GROUP BY product_id
        )
        SELECT p.id, p.name, p.price_amount::float8 AS product_price,
          (p.image_data IS NOT NULL AND p.image_data != '') AS has_image,
          EXTRACT(EPOCH FROM p.image_updated_at)::bigint AS image_version,
          op.display_price::float8, op.display_qty, op.is_visible, op.label_text, op.label_image_data, op.sort_order,
          CASE WHEN wd.product_id IS NOT NULL OR lp.product_id IS NOT NULL
            THEN GREATEST(0, COALESCE(wd.finished_from_p,0) + COALESCE(lp.produced_qty,0) - COALESCE(wd.outbound_qty,0))
            ELSE NULL
          END AS inventory_qty
        FROM products p
        LEFT JOIN order_page_products op ON op.product_id = p.id AND op.tenant_id = p.tenant_id
        LEFT JOIN wd ON wd.product_id = p.id
        LEFT JOIN lp ON lp.product_id = p.id
        WHERE p.tenant_id = ${tenantId}::uuid AND p.category = 'product' AND p.price_amount IS NOT NULL
        ORDER BY COALESCE(op.sort_order, 999) ASC, p.name ASC
      `
      return cors(200, { products })
    }

    return cors(400, { error: 'Invalid action' })
  } catch (e) {
    console.error('handleGet error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function handlePost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Get userId and tenantId from JWT token
    const authInfo = getUserAndTenantFromToken(event)
    if (!authInfo) return cors(403, { error: 'Authentication required' })

    const { userId, tenantId } = authInfo

    // Check if user is super_admin OR tenant_admin for this tenant
    const isSuperAdmin = await checkSuperAdmin(sql, userId)
    const isTenantAdmin = await checkTenantAdmin(sql, userId, tenantId)
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return cors(403, { error: 'Tenant admin access required' })
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : event.body
    const body = JSON.parse(rawBody || '{}')
    const { action } = body

    // Update user's features
    if (action === 'updateUserFeatures') {
      const { userId: targetUserId, features } = body

      if (!targetUserId) {
        return cors(400, { error: 'userId is required' })
      }

      if (!Array.isArray(features)) {
        return cors(400, { error: 'features must be an array' })
      }

      // Verify target user is in this tenant
      const membership = await sql`
        SELECT user_id
        FROM tenant_memberships
        WHERE user_id = ${targetUserId}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `

      if (membership.length === 0) {
        return cors(404, { error: 'User not found in this tenant' })
      }

      const { modules } = body

      // Update user's features and modules in tenant_memberships
      await sql`
        UPDATE tenant_memberships
        SET features = ${JSON.stringify(features)}::jsonb,
            modules = ${modules ? JSON.stringify(modules) : null}::jsonb
        WHERE user_id = ${targetUserId}
          AND tenant_id = ${tenantId}
      `

      return cors(200, { success: true })
    }

    // Create new user in tenant
    if (action === 'createUser') {
      const { email, password, name, role, features } = body

      if (!email || typeof email !== 'string' || !email.trim()) {
        return cors(400, { error: 'Email is required' })
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        return cors(400, { error: 'Password must be at least 8 characters' })
      }
      if (!['tenant_admin', 'tenant_user'].includes(role)) {
        return cors(400, { error: 'Invalid role' })
      }

      const normalizedEmail = email.trim().toLowerCase()

      // Check if email already exists in users table
      const existingUser = await sql`
        SELECT id FROM users WHERE email = ${normalizedEmail}
      `
      if (existingUser.length > 0) {
        return cors(400, { error: 'Email already exists' })
      }

      // Check if email already exists in app_users table
      const existingAppUser = await sql`
        SELECT id FROM app_users WHERE email = ${normalizedEmail}
      `
      if (existingAppUser.length > 0) {
        return cors(400, { error: 'Email already exists in app_users' })
      }

      // Get tenant's available features to validate
      const tenant = await sql`
        SELECT features
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `

      const tenantFeatures = tenant[0]?.features || []
      const validFeatures = Array.isArray(features) 
        ? features.filter(f => tenantFeatures.includes(f))
        : tenantFeatures

      // Hash password
      const bcrypt = await import('bcryptjs')
      const hashedPassword = await bcrypt.default.hash(password, 10)

      // Determine access_level based on role
      const accessLevel = 'admin'

      // Create user in users table
      const userResult = await sql`
        INSERT INTO users (
          email, 
          password_hash, 
          name, 
          role, 
          access_level,
          active, 
          tenant_id
        )
        VALUES (
          ${normalizedEmail}, 
          ${hashedPassword}, 
          ${name || null}, 
          ${role},
          ${accessLevel},
          true, 
          ${tenantId}
        )
        RETURNING id, email, name
      `
      const newUserId = userResult[0].id

      // Create user in app_users table
      await sql`
        INSERT INTO app_users (id, email, is_disabled)
        VALUES (${newUserId}, ${normalizedEmail}, false)
      `

      // Create tenant membership with features
      await sql`
        INSERT INTO tenant_memberships (user_id, tenant_id, role, features)
        VALUES (${newUserId}, ${tenantId}, ${role}, ${JSON.stringify(validFeatures)}::jsonb)
      `

      return cors(201, { user: userResult[0] })
    }

    // Add this BEFORE the final "return cors(400, { error: 'Invalid action' })" line

if (action === 'toggleUserStatus') {
  const { userId: targetUserId, isActive } = body

  if (!targetUserId) {
    return cors(400, { error: 'userId is required' })
  }

  // Verify target user is in this tenant
  const membership = await sql`
    SELECT user_id
    FROM tenant_memberships
    WHERE user_id = ${targetUserId}
      AND tenant_id = ${tenantId}
    LIMIT 1
  `

  if (membership.length === 0) {
    return cors(404, { error: 'User not found in this tenant' })
  }

  const isActiveBoolean = Boolean(isActive)

  // Update all three columns for complete coverage
  await sql`
    UPDATE users
    SET active = ${isActiveBoolean},
        disabled = ${!isActiveBoolean}
    WHERE id = ${targetUserId}
  `

  await sql`
    UPDATE app_users
    SET is_disabled = ${!isActiveBoolean}
    WHERE id = ${targetUserId}
  `

  return cors(200, { success: true, isActive: isActiveBoolean })
}

    if (action === 'updateBookingConfig') {
      const { slug, paymentProvider } = body

      // Sanitize slug: lowercase alphanumeric + hyphens, no leading/trailing hyphens, max 60 chars
      const cleanSlug = (slug || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)

      // Check uniqueness (skip if empty — null is always allowed)
      if (cleanSlug) {
        const existing = await sql`
          SELECT id FROM tenants WHERE booking_slug = ${cleanSlug} AND id != ${tenantId} LIMIT 1
        `
        if (existing.length) {
          return cors(400, { error: 'That booking URL is already taken. Please choose another.' })
        }
      }

      const validProviders = ['none', 'stripe', 'amp']
      const provider = validProviders.includes(paymentProvider) ? paymentProvider : 'none'

      await sql`
        UPDATE tenants
        SET booking_slug             = ${cleanSlug || null},
            booking_payment_provider = ${provider}
        WHERE id = ${tenantId}
      `

      return cors(200, { ok: true, slug: cleanSlug, paymentProvider: provider })
    }

    if (action === 'updateInvoiceConfig') {
      const { invoiceConfig } = body
      if (!invoiceConfig || typeof invoiceConfig !== 'object' || Array.isArray(invoiceConfig)) {
        return cors(400, { error: 'invoiceConfig must be an object' })
      }
      await sql`
        UPDATE tenants
        SET invoice_config = ${JSON.stringify(invoiceConfig)}::jsonb
        WHERE id = ${tenantId}
      `
      return cors(200, { success: true })
    }

    if (action === 'updateUserGeo') {
      const { userId: targetUserId, language, currency, timezone } = body
      if (!targetUserId) return cors(400, { error: 'userId is required' })

      // Verify user belongs to this tenant
      const membership = await sql`
        SELECT user_id FROM tenant_memberships
        WHERE user_id = ${targetUserId} AND tenant_id = ${tenantId}
        LIMIT 1
      `
      if (membership.length === 0) return cors(404, { error: 'User not found in this tenant' })

      const languageToLocale = { en: 'en-US', sv: 'sv-SE', es: 'es-ES' }
      const locale = language != null ? (languageToLocale[language] || 'en-US') : null

      await sql`
        UPDATE users
        SET preferred_language = ${language ?? null},
            preferred_locale   = ${locale},
            preferred_currency = ${currency ?? null},
            preferred_timezone = ${timezone ?? null}
        WHERE id = ${targetUserId}
      `
      return cors(200, { success: true })
    }

    if (action === 'updateUiConfig') {
      const { uiConfig } = body
      if (typeof uiConfig !== 'object' || uiConfig === null) return cors(400, { error: 'uiConfig must be an object' })
      await sql`UPDATE tenants SET ui_config = ${JSON.stringify(uiConfig)}::jsonb WHERE id = ${tenantId}`
      return cors(200, { success: true })
    }

    if (action === 'saveDefaultShippingMethod') {
      const { method } = body
      if (!['per_item', 'per_order'].includes(method)) return cors(400, { error: 'Invalid method' })
      await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_shipping_method TEXT NOT NULL DEFAULT 'per_item'`.catch(() => {})
      await sql`UPDATE tenants SET default_shipping_method = ${method} WHERE id = ${tenantId}::uuid`
      return cors(200, { success: true })
    }

    if (action === 'setBulkShippingCost') {
      const { shippingCost, target, customerIds, applyToHistory, effectiveDate } = body
      const sc = shippingCost === null || shippingCost === undefined ? null : Number(shippingCost)
      if (shippingCost != null && !Number.isFinite(sc)) return cors(400, { error: 'shippingCost must be a number' })

      // Resolve which customers to target
      let targetIds = []
      if (target === 'all') {
        const rows = await sql`SELECT id FROM customers WHERE tenant_id = ${tenantId}::uuid`
        targetIds = rows.map(r => r.id)
      } else if (target === 'direct') {
        const rows = await sql`SELECT id FROM customers WHERE tenant_id = ${tenantId}::uuid AND customer_type IN ('Direct', 'BLV')`
        targetIds = rows.map(r => r.id)
      } else if (target === 'partner') {
        const rows = await sql`SELECT id FROM customers WHERE tenant_id = ${tenantId}::uuid AND customer_type = 'Partner'`
        targetIds = rows.map(r => r.id)
      } else if (target === 'custom') {
        targetIds = Array.isArray(customerIds) ? customerIds : []
      }

      if (targetIds.length === 0) return cors(400, { error: 'No customers matched the selected target' })

      // Determine whether to update customers.shipping_cost immediately
      let shouldUpdateNow = false
      if (applyToHistory) {
        shouldUpdateNow = true
      } else if (effectiveDate) {
        const effDate = new Date(effectiveDate + 'T00:00:00Z')
        const today = new Date(); today.setUTCHours(0, 0, 0, 0)
        shouldUpdateNow = effDate <= today
      } else {
        shouldUpdateNow = true // next order = effective now
      }

      for (const customerId of targetIds) {
        if (shouldUpdateNow) {
          await sql`UPDATE customers SET shipping_cost = ${sc} WHERE tenant_id = ${tenantId}::uuid AND id = ${customerId}::uuid`
        }
        if (applyToHistory) {
          await sql`DELETE FROM shipping_cost_history WHERE tenant_id = ${tenantId}::uuid AND customer_id = ${customerId}::uuid`
          await sql`INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from) VALUES (${tenantId}::uuid, ${customerId}::uuid, ${sc}, '1970-01-01')`
        } else if (effectiveDate) {
          await sql`INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from) VALUES (${tenantId}::uuid, ${customerId}::uuid, ${sc}, ${effectiveDate})`
        } else {
          await sql`INSERT INTO shipping_cost_history (tenant_id, customer_id, shipping_cost, effective_from) VALUES (${tenantId}::uuid, ${customerId}::uuid, ${sc}, NOW())`
        }
      }

      return cors(200, { success: true, updated: targetIds.length })
    }

    if (action === 'setHiddenCustomers') {
      const { hiddenCustomerIds } = body
      if (!Array.isArray(hiddenCustomerIds)) return cors(400, { error: 'hiddenCustomerIds must be an array' })
      await sql`CREATE TABLE IF NOT EXISTS tenant_hidden_customers (tenant_id UUID NOT NULL, customer_id UUID NOT NULL, PRIMARY KEY (tenant_id, customer_id))`.catch(() => {})
      await sql`DELETE FROM tenant_hidden_customers WHERE tenant_id = ${tenantId}::uuid`
      if (hiddenCustomerIds.length > 0) {
        for (const customerId of hiddenCustomerIds) {
          await sql`INSERT INTO tenant_hidden_customers (tenant_id, customer_id) VALUES (${tenantId}::uuid, ${customerId}::uuid) ON CONFLICT DO NOTHING`
        }
      }
      return cors(200, { success: true })
    }

    if (action === 'toggleHideCustomer') {
      const { customerId, hide } = body
      if (!customerId) return cors(400, { error: 'customerId required' })
      // Verify customer belongs to this tenant
      const owns = await sql`SELECT id FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1`
      if (!owns.length) return cors(404, { error: 'Customer not found' })
      await sql`CREATE TABLE IF NOT EXISTS tenant_hidden_customers (tenant_id UUID NOT NULL, customer_id UUID NOT NULL, PRIMARY KEY (tenant_id, customer_id))`.catch(() => {})
      if (hide) {
        await sql`INSERT INTO tenant_hidden_customers (tenant_id, customer_id) VALUES (${tenantId}::uuid, ${customerId}::uuid) ON CONFLICT DO NOTHING`
      } else {
        await sql`DELETE FROM tenant_hidden_customers WHERE tenant_id = ${tenantId}::uuid AND customer_id = ${customerId}::uuid`
      }
      return cors(200, { success: true })
    }

    if (action === 'deleteCustomer') {
      const { customerId } = body
      if (!customerId) return cors(400, { error: 'customerId required' })
      // Verify customer belongs to this tenant
      const owns = await sql`SELECT id FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1`
      if (!owns.length) return cors(404, { error: 'Customer not found' })
      // Cascade in order — FK constraints on orders/payments are RESTRICT so must delete those first.
      // Nullable booking FK fields are set to NULL to avoid cascading into complex booking trees.
      // Delete booking dependents first (all RESTRICT), then bookings themselves
      // orders.booking_id and payments.booking_id are SET NULL so they handle themselves
      await sql`DELETE FROM booking_participants  WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid)`
      await sql`DELETE FROM payment_transactions  WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid)`
      await sql`DELETE FROM payment_obligations   WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid)`
      await sql`DELETE FROM message_jobs          WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid)`
      await sql`DELETE FROM bookings              WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`
      await sql`DELETE FROM booking_customer_links  WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`
      await sql`DELETE FROM tenant_hidden_customers WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`
      await sql`DELETE FROM payments WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`
      await sql`DELETE FROM orders   WHERE customer_id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`
      // Deleting the customer row cascades to: customer_links, customer_messages, shipping_cost_history
      await sql`DELETE FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}::uuid`
      return cors(200, { success: true })
    }

    if (action === 'setCashReporters') {
      const { userIds } = body
      if (!Array.isArray(userIds)) return cors(400, { error: 'userIds must be an array' })
      await sql`ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS can_report_cash BOOLEAN NOT NULL DEFAULT TRUE`.catch(() => {})
      // Set true for listed users, false for all others in this tenant
      await sql`
        UPDATE tenant_memberships
        SET can_report_cash = (user_id = ANY(${userIds}::uuid[]))
        WHERE tenant_id = ${tenantId}::uuid
      `
      return cors(200, { success: true })
    }

    if (action === 'saveOrderPageConfig') {
      const { slug, isActive, password, clearPassword, sessionMinutes, geoCountries, geoStates } = body

      await sql`CREATE TABLE IF NOT EXISTS order_page_config (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        slug TEXT UNIQUE, is_active BOOLEAN NOT NULL DEFAULT false,
        password_hash TEXT, session_minutes INTEGER,
        geo_countries TEXT[], geo_states TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`.catch(() => {})

      const cleanSlug = (slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 60)
      if (cleanSlug) {
        const existing = await sql`SELECT tenant_id FROM order_page_config WHERE slug = ${cleanSlug} AND tenant_id != ${tenantId}::uuid LIMIT 1`
        if (existing.length) return cors(400, { error: 'That URL is already taken. Please choose another.' })
      }

      // Compute password hash if a new password was provided
      const secret = process.env.ORDER_PAGE_SECRET || process.env.CUSTOMER_TOKEN_SECRET || 'fallback-secret'
      let passwordHash = undefined
      if (clearPassword) {
        passwordHash = null
      } else if (password) {
        const crypto = await import('crypto')
        passwordHash = crypto.createHmac('sha256', secret).update(`${tenantId}:${password}`).digest('hex')
      }

      const geoArr = Array.isArray(geoCountries) ? geoCountries.filter(Boolean) : []
      const stateArr = Array.isArray(geoStates) ? geoStates.filter(Boolean) : []
      const sessMins = Number.isFinite(Number(sessionMinutes)) ? Number(sessionMinutes) : 60

      const existing = await sql`SELECT tenant_id FROM order_page_config WHERE tenant_id = ${tenantId}::uuid LIMIT 1`
      if (!existing.length) {
        await sql`
          INSERT INTO order_page_config (tenant_id, slug, is_active, password_hash, session_minutes, geo_countries, geo_states)
          VALUES (${tenantId}::uuid, ${cleanSlug || null}, ${!!isActive},
            ${passwordHash !== undefined ? passwordHash : null},
            ${sessMins}, ${geoArr.length ? geoArr : null}, ${stateArr.length ? stateArr : null})
        `
      } else {
        if (passwordHash !== undefined) {
          await sql`
            UPDATE order_page_config SET slug = ${cleanSlug || null}, is_active = ${!!isActive},
              password_hash = ${passwordHash}, session_minutes = ${sessMins},
              geo_countries = ${geoArr.length ? geoArr : null}, geo_states = ${stateArr.length ? stateArr : null},
              updated_at = now()
            WHERE tenant_id = ${tenantId}::uuid
          `
        } else {
          await sql`
            UPDATE order_page_config SET slug = ${cleanSlug || null}, is_active = ${!!isActive},
              session_minutes = ${sessMins},
              geo_countries = ${geoArr.length ? geoArr : null}, geo_states = ${stateArr.length ? stateArr : null},
              updated_at = now()
            WHERE tenant_id = ${tenantId}::uuid
          `
        }
      }
      return cors(200, { ok: true, slug: cleanSlug })
    }

    if (action === 'saveOrderPageProduct') {
      const { productId, displayPrice, displayQty, isVisible, labelText, labelImageData, sortOrder } = body
      if (!productId) return cors(400, { error: 'productId required' })

      await sql`CREATE TABLE IF NOT EXISTS order_page_products (
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        display_price NUMERIC(12,2), display_qty INTEGER,
        is_visible BOOLEAN NOT NULL DEFAULT true,
        label_text TEXT, label_image_data TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, product_id)
      )`.catch(() => {})

      const price = displayPrice != null && displayPrice !== '' ? Number(displayPrice) : null
      const qty   = displayQty  != null && displayQty  !== '' ? Number(displayQty)   : null

      await sql`
        INSERT INTO order_page_products (tenant_id, product_id, display_price, display_qty, is_visible, label_text, label_image_data, sort_order)
        VALUES (${tenantId}::uuid, ${productId}::uuid, ${price}, ${qty}, ${isVisible !== false},
          ${labelText || null}, ${labelImageData || null}, ${sortOrder ?? 0})
        ON CONFLICT (tenant_id, product_id) DO UPDATE SET
          display_price    = EXCLUDED.display_price,
          display_qty      = EXCLUDED.display_qty,
          is_visible       = EXCLUDED.is_visible,
          label_text       = EXCLUDED.label_text,
          label_image_data = EXCLUDED.label_image_data,
          sort_order       = EXCLUDED.sort_order
      `
      return cors(200, { ok: true })
    }

    return cors(400, { error: 'Invalid action' })
  } catch (e) {
    console.error('handlePost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// Extract userId and tenantId from JWT token and headers
function getUserAndTenantFromToken(event) {
  try {
    const { JWT_SECRET } = process.env
    if (!JWT_SECRET) return null

    const authHeader = event.headers?.authorization || event.headers?.Authorization
    if (!authHeader) return null

    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return null

    const decoded = jwt.verify(token, JWT_SECRET)

    // Get tenantId from active tenant header or from token
    const tenantId = 
      event.headers['x-active-tenant'] ||
      event.headers['X-Active-Tenant'] ||
      decoded.tenantId

    return {
      userId: decoded.userId,
      tenantId: tenantId
    }
  } catch (e) {
    console.error('Token decode error:', e)
    return null
  }
}

// Check if user is super-admin by email
async function checkSuperAdmin(sql, userId) {
  try {
    const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
    
    if (SUPER_ADMIN_EMAILS.length === 0) {
      return false
    }

    const user = await sql`
      SELECT email FROM users WHERE id = ${userId}
    `
    
    if (user.length === 0) return false
    
    return SUPER_ADMIN_EMAILS.includes(user[0].email.toLowerCase())
  } catch (e) {
    console.error('checkSuperAdmin error:', e)
    return false
  }
}

// Check if user is tenant_admin for the specified tenant
async function checkTenantAdmin(sql, userId, tenantId) {
  try {
    const membership = await sql`
      SELECT role
      FROM tenant_memberships
      WHERE user_id = ${userId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `

    if (membership.length === 0) return false

    return membership[0].role === 'tenant_admin'
  } catch (e) {
    console.error('checkTenantAdmin error:', e)
    return false
  }
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
    body: JSON.stringify(body),
  }
}
