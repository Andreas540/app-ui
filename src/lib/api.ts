// src/lib/api.ts
export type Person = { id: string; name: string; type: 'Customer' | 'Partner' }
export type Product = { id: string; name: string; unit_price: number }

// Call your deployed site in dev; same-origin in prod
const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

export async function fetchBootstrap() {
  const res = await fetch(`${base}/api/bootstrap`, { method: 'GET', cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load bootstrap data (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { customers: Person[]; products: Product[] }
}

// ---- Additions for saving orders ----
export type NewOrderInput = {
  customer_id: string
  product_id: string
  qty: number
  unit_price: number
  date: string        // 'YYYY-MM-DD'
  delivered?: boolean
  discount?: number
}

export async function createOrder(input: NewOrderInput) {
  const res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save order (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { ok: true; order_id: string; order_no: number }
}


