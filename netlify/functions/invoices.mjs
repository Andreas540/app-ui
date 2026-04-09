// netlify/functions/invoices.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return listInvoices(event)
  if (event.httpMethod === 'POST')   return saveInvoice(event)
  return cors(405, { error: 'Method not allowed' })
}

async function saveInvoice(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { invoiceData, totalAmount } = body

    if (!invoiceData) return cors(400, { error: 'invoiceData required' })

    // Extract top-level columns from the snapshot
    const invoiceNo    = invoiceData.invoiceNo    || null
    const invoiceDate  = invoiceData.invoiceDate  || null
    const dueDate      = invoiceData.dueDate      || null
    const customerId   = invoiceData.customer?.id || null
    const customerName = invoiceData.customer?.name || invoiceData.customer?.company_name || null
    const total        = totalAmount != null ? Number(totalAmount) : null

    // Strip logoDataUrl from stored snapshot — it's large and can be re-fetched
    const { logoDataUrl: _logo, ...dataToStore } = invoiceData

    const result = await sql`
      INSERT INTO invoices (
        tenant_id, invoice_no, invoice_date, due_date,
        customer_id, customer_name, total_amount, invoice_data
      ) VALUES (
        ${TENANT_ID}, ${invoiceNo}, ${invoiceDate}, ${dueDate},
        ${customerId}, ${customerName}, ${total}, ${JSON.stringify(dataToStore)}
      )
      RETURNING id, created_at
    `

    return cors(200, { ok: true, id: result[0].id, created_at: result[0].created_at })
  } catch (e) {
    console.error('saveInvoice error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function listInvoices(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const params = new URLSearchParams(event.queryStringParameters || {})
    const id   = params.get('id')
    const from = params.get('from')
    const to   = params.get('to')

    // Single invoice fetch (full snapshot)
    if (id) {
      const rows = await sql`
        SELECT id, invoice_no, invoice_date, due_date, customer_name, total_amount, invoice_data, created_at
        FROM invoices
        WHERE tenant_id = ${TENANT_ID} AND id = ${id}
        LIMIT 1
      `
      if (rows.length === 0) return cors(404, { error: 'Invoice not found' })
      return cors(200, rows[0])
    }

    if (!from || !to) return cors(400, { error: 'from and to parameters required (YYYY-MM-DD)' })

    const rows = await sql`
      SELECT
        id,
        invoice_no,
        invoice_date,
        due_date,
        customer_name,
        total_amount,
        created_at
      FROM invoices
      WHERE tenant_id = ${TENANT_ID}
        AND invoice_date >= ${from}
        AND invoice_date <= ${to}
      ORDER BY invoice_date DESC, created_at DESC
    `

    return cors(200, rows)
  } catch (e) {
    console.error('listInvoices error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}
