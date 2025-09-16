export type Person = { id: string; name: string; type: 'Customer' | 'Partner' }
export type Product = { id: string; name: string; unit_price: number }

// In dev, call your deployed site so /api works cross-origin; in prod, same-origin.
const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

export async function fetchBootstrap() {
  const res = await fetch(`${base}/api/bootstrap`, {
    method: 'GET',
    // prevent any caching of the bootstrap payload
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load bootstrap data (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { customers: Person[]; products: Product[] }
}

