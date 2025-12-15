// netlify/functions/partner-transfer.mjs
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'POST') return createPartnerTransfer(event);
  return cors(405, { error: 'Method not allowed' });
}

async function createPartnerTransfer(event) {
  try {
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const { payments } = body;

    if (!Array.isArray(payments) || payments.length !== 2) {
      return cors(400, { error: 'Invalid payments array - must contain exactly 2 payments' });
    }

    const sql = neon(DATABASE_URL);

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });
    const TENANT_ID = authz.tenantId;

    // Verify both partners exist and belong to tenant
    for (const payment of payments) {
      const partnerCheck = await sql`
        SELECT id FROM partners
        WHERE id = ${payment.partner_id} AND tenant_id = ${TENANT_ID}
        LIMIT 1
      `;
      if (partnerCheck.length === 0) {
        return cors(404, { error: `Partner ${payment.partner_id} not found` });
      }
    }

    // Insert both payments with the same ID
    for (const payment of payments) {
      await sql`
        INSERT INTO partner_payments (id, tenant_id, partner_id, payment_date, payment_type, amount, notes)
        VALUES (
          ${payment.id},
          ${TENANT_ID},
          ${payment.partner_id},
          ${payment.payment_date},
          ${payment.payment_type},
          ${payment.amount},
          ${payment.notes}
        )
      `;
    }

    return cors(200, { ok: true, id: payments[0].id });
  } catch (error) {
    console.error('Partner transfer error:', error);
    return cors(500, { error: String(error?.message || error) });
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
  };
}