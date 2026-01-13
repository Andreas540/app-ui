// netlify/functions/serve-icon.mjs
export async function handler(event) {
  try {
    const { getStore } = await import('@netlify/blobs')
    
    // Get filename from path
    const path = event.path.replace('/.netlify/functions/serve-icon/', '')
    const filename = path || event.queryStringParameters?.file
    
    if (!filename) {
      return {
        statusCode: 400,
        body: 'Filename required'
      }
    }

    // Get from Netlify Blobs
    const store = getStore('tenant-icons')
    const imageBuffer = await store.get(filename, { type: 'arrayBuffer' })
    
    if (!imageBuffer) {
      return {
        statusCode: 404,
        body: 'Icon not found'
      }
    }

    // Return image
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      },
      body: Buffer.from(imageBuffer).toString('base64'),
      isBase64Encoded: true
    }
  } catch (e) {
    console.error(e)
    return {
      statusCode: 500,
      body: String(e?.message || e)
    }
  }
}