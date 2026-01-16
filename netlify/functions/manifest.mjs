// netlify/functions/manifest.mjs
export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    
    if (!DATABASE_URL) {
      return defaultManifest()
    }

    const sql = neon(DATABASE_URL)
    
    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')
    const v = params.get('v') || Date.now()

    if (!tenantId) {
      return defaultManifest()
    }

    // Get tenant data including app_name
    const tenant = await sql`
      SELECT name, app_name, app_icon_192, app_icon_512
      FROM tenants
      WHERE id = ${tenantId}
      LIMIT 1
    `

    if (tenant.length === 0) {
      return defaultManifest()
    }

    const t = tenant[0]
    
    // Use app_name if available, otherwise fallback to name, then to 'Soltiva'
    const displayName = t.app_name || t.name || 'Soltiva'
    
    const icon192 = t.app_icon_192
      ? `/.netlify/functions/serve-icon?tenant_id=${tenantId}&type=192&v=${v}`
      : `/icons/icon-192.png?v=${v}`

    const icon512 = t.app_icon_512
      ? `/.netlify/functions/serve-icon?tenant_id=${tenantId}&type=512&v=${v}`
      : `/icons/icon-512.png?v=${v}`

    const manifest = {
      name: displayName,
      short_name: displayName,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0b1020',
      theme_color: '#6aa1ff',
      icons: [
        {
          src: icon192,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: icon512,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    }

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify(manifest)
    }
  } catch (e) {
    console.error('Error generating manifest:', e)
    return defaultManifest()
  }
}

function defaultManifest() {
  const manifest = {
    name: 'Soltiva',
    short_name: 'Soltiva',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1020',
    theme_color: '#6aa1ff',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  }

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    },
    body: JSON.stringify(manifest)
  }
}