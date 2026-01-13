// netlify/functions/manifest.mjs
export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    
    // If no database, return default
    if (!DATABASE_URL) {
      return defaultManifest()
    }

    const sql = neon(DATABASE_URL)
    
    // Get tenant from query parameter
    const params = new URLSearchParams(event.queryStringParameters || {})
    const tenantId = params.get('tenant_id')

    // No tenant = return default
    if (!tenantId) {
      return defaultManifest()
    }

    // Get tenant data
    const tenant = await sql`
      SELECT name, app_icon_192, app_icon_512
      FROM tenants
      WHERE id = ${tenantId}
      LIMIT 1
    `

    // Tenant not found = return default
    if (tenant.length === 0) {
      return defaultManifest()
    }

    const t = tenant[0]
    
    // Use custom icons if available, otherwise use defaults
    const icon192 = t.app_icon_192 ? `/.netlify/functions/serve-icon?tenant_id=${tenantId}&type=192` : '/icons/icon-192.png'
const icon512 = t.app_icon_512 ? `/.netlify/functions/serve-icon?tenant_id=${tenantId}&type=512` : '/icons/icon-512.png'

    const manifest = {
      name: t.name || 'BLV App',
      short_name: t.name || 'BLV App',
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
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify(manifest)
    }
  } catch (e) {
    console.error('Error generating manifest:', e)
    // On any error, return default
    return defaultManifest()
  }
}

function defaultManifest() {
  // Exact copy of your current manifest.webmanifest
  const manifest = {
    name: 'BLV App',
    short_name: 'BLV App',
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
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*'
    },
    body: JSON.stringify(manifest)
  }
}