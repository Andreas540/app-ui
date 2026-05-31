export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return { statusCode: 500, body: 'DATABASE_URL not configured' }

    const params = new URLSearchParams(event.queryStringParameters || {})
    const id = params.get('id')
    if (!id) return { statusCode: 400, body: 'id required' }

    const sql = neon(DATABASE_URL)
    const rows = await sql`SELECT image_data FROM products WHERE id = ${id} LIMIT 1`
    if (!rows.length || !rows[0].image_data) return { statusCode: 404, body: 'Image not found' }

    const raw = rows[0].image_data
    const base64 = raw.includes(',') ? raw.split(',')[1] : raw
    const mimeMatch = raw.match(/^data:([^;]+);/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'

    return {
      statusCode: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
        'access-control-allow-origin': '*',
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) }
  }
}
