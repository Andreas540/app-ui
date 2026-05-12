// netlify/functions/cash-transactions.mjs
// GET  ?user_id=UUID&from=YYYY-MM-DD&to=YYYY-MM-DD  → { users, transactions, ingoing_balance }
// POST { user_id, transaction_date, transaction_type, amount, comment }  → { ok, id }
// DELETE { id }  → { ok }

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getTransactions(event)
  if (event.httpMethod === 'POST')   return createTransaction(event)
  if (event.httpMethod === 'DELETE') return deleteTransaction(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getTransactions(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Ensure table exists (idempotent)
    await sql`
      CREATE TABLE IF NOT EXISTS cash_transactions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id          UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        amount           NUMERIC(12,2) NOT NULL,
        comment          TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch(() => {})

    const { user_id, from, to } = event.queryStringParameters || {}
    if (!from || !to) return cors(400, { error: 'from and to are required' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return cors(400, { error: 'Invalid date format' })
    }

    // Users eligible to report cash transactions for this tenant
    const users = await sql`
      SELECT u.id, u.name
      FROM users u
      JOIN tenant_memberships tm ON tm.user_id = u.id
      WHERE tm.tenant_id = ${TENANT_ID}::uuid
        AND tm.can_report_cash = true
      ORDER BY u.name
    `

    // user_id='all' or absent → aggregate all users for this tenant
    const targetUserId = (user_id && user_id !== 'all') ? user_id : null

    if (targetUserId) {
      const userCheck = await sql`
        SELECT 1 FROM tenant_memberships
        WHERE user_id = ${targetUserId}::uuid AND tenant_id = ${TENANT_ID}::uuid
        LIMIT 1
      `
      if (!userCheck.length) return cors(403, { error: 'User not in tenant' })
    }

    const transactions = targetUserId
      ? await sql`
          SELECT id, transaction_date::text, transaction_type, amount::float8, comment, NULL::text AS user_name
          FROM cash_transactions
          WHERE tenant_id        = ${TENANT_ID}::uuid
            AND user_id          = ${targetUserId}::uuid
            AND transaction_date >= ${from}::date
            AND transaction_date <= ${to}::date
          ORDER BY transaction_date DESC, created_at DESC
        `
      : await sql`
          SELECT ct.id, ct.transaction_date::text, ct.transaction_type, ct.amount::float8, ct.comment, u.name AS user_name
          FROM cash_transactions ct
          JOIN users u ON u.id = ct.user_id
          WHERE ct.tenant_id        = ${TENANT_ID}::uuid
            AND ct.transaction_date >= ${from}::date
            AND ct.transaction_date <= ${to}::date
          ORDER BY ct.transaction_date DESC, ct.created_at DESC
        `

    // Ingoing balance excludes remittances (they are tracked separately)
    const balRows = targetUserId
      ? await sql`
          SELECT COALESCE(SUM(amount), 0)::float8 AS ingoing_balance
          FROM cash_transactions
          WHERE tenant_id = ${TENANT_ID}::uuid AND user_id = ${targetUserId}::uuid
            AND transaction_date < ${from}::date
            AND transaction_type != 'remittance'
        `
      : await sql`
          SELECT COALESCE(SUM(amount), 0)::float8 AS ingoing_balance
          FROM cash_transactions
          WHERE tenant_id = ${TENANT_ID}::uuid AND transaction_date < ${from}::date
            AND transaction_type != 'remittance'
        `

    // All remittances before the period (for ingoing surplus calculation)
    const remitRows = targetUserId
      ? await sql`
          SELECT COALESCE(SUM(amount), 0)::float8 AS remittances_before
          FROM cash_transactions
          WHERE tenant_id = ${TENANT_ID}::uuid AND user_id = ${targetUserId}::uuid
            AND transaction_date < ${from}::date
            AND transaction_type = 'remittance'
        `
      : await sql`
          SELECT COALESCE(SUM(amount), 0)::float8 AS remittances_before
          FROM cash_transactions
          WHERE tenant_id = ${TENANT_ID}::uuid AND transaction_date < ${from}::date
            AND transaction_type = 'remittance'
        `

    return cors(200, {
      users,
      transactions,
      ingoing_balance:    balRows[0].ingoing_balance,
      remittances_before: remitRows[0].remittances_before,
    })
  } catch (e) {
    console.error('cash-transactions GET error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function createTransaction(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { user_id, transaction_date, transaction_type, amount, comment } = body

    if (!user_id || !transaction_date || !transaction_type || amount === undefined || amount === null) {
      return cors(400, { error: 'Missing required fields' })
    }
    if (!['cash_pickup', 'salary', 'expense', 'remittance'].includes(transaction_type)) {
      return cors(400, { error: 'Invalid transaction_type' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction_date)) {
      return cors(400, { error: 'Invalid transaction_date' })
    }

    const userCheck = await sql`
      SELECT 1 FROM tenant_memberships
      WHERE user_id = ${user_id}::uuid AND tenant_id = ${TENANT_ID}::uuid
        AND can_report_cash = true
      LIMIT 1
    `
    if (!userCheck.length) return cors(403, { error: 'User not authorised to report cash' })

    const row = await sql`
      INSERT INTO cash_transactions (tenant_id, user_id, transaction_date, transaction_type, amount, comment)
      VALUES (
        ${TENANT_ID}::uuid,
        ${user_id}::uuid,
        ${transaction_date}::date,
        ${transaction_type},
        ${Number(amount)},
        ${comment || null}
      )
      RETURNING id
    `

    return cors(201, { ok: true, id: row[0].id })
  } catch (e) {
    console.error('cash-transactions POST error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteTransaction(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { id } = body
    if (!id) return cors(400, { error: 'id required' })

    await sql`
      DELETE FROM cash_transactions
      WHERE id = ${id}::uuid AND tenant_id = ${TENANT_ID}::uuid
    `

    return cors(200, { ok: true })
  } catch (e) {
    console.error('cash-transactions DELETE error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id,x-active-tenant',
    },
    body: status === 204 ? '' : JSON.stringify(body),
  }
}
