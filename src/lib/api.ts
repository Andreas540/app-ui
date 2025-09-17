// src/lib/api.ts

// ---- Core types ----
export type Person  = { id: string; name: string; type: 'Customer' | 'Partner' }
export type Product = { id: string; name: string } // no unit_price anymore

// Call your deployed site in dev; same-origin in prod
const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

// ---- Bootstrap (customers + products without price) ----
export async function fetchBootstrap() {
  const res = await fetch(`${base}/api/bootstrap`, { method: 'GET', cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load bootstrap data (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { customers: Person[]; products: Product[] }
}

// ---- Orders API ----
export type NewOrderInput = {
  customer_id: string
  product_id: string
  qty: number
  unit_price: number   // per-order-line price
  date: string         // YYYY-MM-DD
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

// ---- Payments API ----
export type PaymentType =
  | 'Cash payment' | 'Cash App payment' | 'Credit payment' | 'Shipping fee'
  | 'Discount' | 'Credit' | 'Old tab' | 'Wire Payment' | 'Zelle payment'

export const PAYMENT_TYPES: PaymentType[] = [
  'Cash payment','Cash App payment','Credit payment','Shipping fee',
  'Discount','Credit','Old tab','Wire Payment','Zelle payment'
]

export type NewPaymentInput = {
  customer_id: string
  payment_type: PaymentType
  amount: number           // non-zero, +/- allowed
  payment_date: string     // YYYY-MM-DD
  notes?: string | null
  order_id?: string | null
}

export async function createPayment(input: NewPaymentInput) {
  const res = await fetch(`${base}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save payment (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { ok: true; id: string }
}

export async function listPayments(limit = 20) {
  const res = await fetch(`${base}/api/payments?limit=${encodeURIComponent(String(limit))}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load payments (status ${res.status})`)
  return (await res.json()) as { payments: Array<{
    id: string; payment_date: string; payment_type: PaymentType; amount: number;
    customer_name: string; customer_id: string; notes?: string | null;
  }>}
}

// ---- Customers (with totals/owed) ----
export type CustomerWithOwed = {
  id: string
  name: string
  type: 'Customer' | 'Partner'
  customer_type?: 'BLV' | 'Partner'
  total_orders: number
  total_payments: number
  owed_to_me: number
}

export async function listCustomersWithOwed(q?: string) {
  const url = `${base}/api/customers` + (q ? `?q=${encodeURIComponent(q)}` : '')
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load customers (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { customers: CustomerWithOwed[] }
}

// ---- Create Customer ----
export type CustomerType = 'BLV' | 'Partner'

export type NewCustomerInput = {
  name: string
  customer_type: CustomerType
  shipping_cost?: number
  phone?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postal_code?: string
}

export async function createCustomer(input: NewCustomerInput) {
  const res = await fetch(`${base}/api/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to create customer (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return (await res.json()) as { ok: true; id: string }
}
