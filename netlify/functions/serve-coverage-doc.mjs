// netlify/functions/serve-coverage-doc.mjs
// Serves the reference document stored in products.coverage_doc_data.
// ?id=<product_id>  — returns the raw file with Content-Disposition: attachment.

export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return { statusCode: 500, body: 'DATABASE_URL not configured' }

    const params = new URLSearchParams(event.queryStringParameters || {})
    const id = params.get('id')
    if (!id) return { statusCode: 400, body: 'id required' }

    const sql = neon(DATABASE_URL)
    const rows = await sql`
      SELECT name, coverage_doc_data FROM products WHERE id = ${id} AND product_kind = 'addon' LIMIT 1
    `
    if (!rows.length || !rows[0].coverage_doc_data) return { statusCode: 404, body: 'Document not found' }

    const raw = rows[0].coverage_doc_data
    const base64 = raw.includes(',') ? raw.split(',')[1] : raw
    const mimeMatch = raw.match(/^data:([^;]+);/)
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'

    const ext = mime === 'application/pdf' ? '.pdf'
      : mime.startsWith('image/') ? '.' + mime.split('/')[1]
      : ''
    const filename = (rows[0].name || 'document').replace(/[^a-zA-Z0-9_-]/g, '_') + ext

    return {
      statusCode: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
        'access-control-allow-origin': '*',
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) }
  }
}
