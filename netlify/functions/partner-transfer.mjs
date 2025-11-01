// netlify/functions/partner-transfer.mjs
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { payments } = await req.json()

    if (!Array.isArray(payments) || payments.length !== 2) {
      return new Response('Invalid payments array', { status: 400 })
    }

    // Insert both payments with the same ID
    for (const payment of payments) {
      await sql`
        INSERT INTO partner_payments (id, partner_id, payment_date, payment_type, amount, notes)
        VALUES (
          ${payment.id},
          ${payment.partner_id},
          ${payment.payment_date},
          ${payment.payment_type},
          ${payment.amount},
          ${payment.notes}
        )
      `
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  } catch (error) {
    console.error('Partner transfer error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }
}