export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getOrder(event)
  if (event.httpMethod === 'PUT')    return updateOrder(event)
  if (event.httpMethod === 'DELETE') return deleteOrder(event)
  return cors(405, { error: 'Method not allowed' })
}

// Add this function before the cors function:
async function deleteOrder(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const body = JSON.parse(event.body || '{}')
    const { id } = body

    if (!id) return cors(400, { error: 'id is required' })

    const sql = neon(DATABASE_URL)

    // Delete order (CASCADE should handle order_items and order_partners)
    await sql`
      DELETE FROM orders
      WHERE tenant_id = ${TENANT_ID} AND id = ${id}
    `

    return cors(200, { ok: true })
  } catch (e) {
    console.error('deleteOrder error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// Update cors function to include DELETE:
function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}