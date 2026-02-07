// src/lib/api.ts


// ---- Core types ----
export type Person = { id: string; name: string; type?: 'Customer' | 'Partner'; customer_type?: 'BLV' | 'Partner' }
export type Product = { id: string; name: string } // no unit_price anymore

// Call your deployed site in dev; same-origin in prod
const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

// ---- Helper: Get auth headers ----
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken')
  const activeTenant = localStorage.getItem('activeTenantId')

  return {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeTenant ? { 'X-Active-Tenant': activeTenant } : {})
  }
}

// ---- Maintenance kick-out ----
const MAINTENANCE_PATH = '/maintenance.html'

function kickOutToMaintenance() {
  try {
    localStorage.removeItem('authToken')
    localStorage.removeItem('activeTenantId')
    sessionStorage.clear()
  } catch {
    // ignore storage errors
  }
  // Force navigation away from the running SPA
  window.location.replace(MAINTENANCE_PATH)
}

async function handleAuthFailure(res: Response) {
  // Backend returns 503 during maintenance - kick everyone out
  if (res.status === 503 || res.status === 401 || res.status === 403) {
    kickOutToMaintenance()
    throw new Error(`Auth blocked (status ${res.status})`)
  }
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
    
  const res = await fetch(input, init)
  await handleAuthFailure(res)
  return res
}

// ---- Bootstrap (customers + products without price) ----
export async function fetchBootstrap() {
  const res = await apiFetch(`${base}/api/bootstrap`, {
    method: 'GET',
    cache: 'no-store',
    headers: getAuthHeaders()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load bootstrap data (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as {
    customers: Person[]
    products: Product[]
    partners?: Array<{ id: string; name: string }>
    suppliers?: Array<{ id: string; name: string }>
  }
}

// ---- Orders API ----
export type NewOrderInput = {
  customer_id: string
  product_id: string
  qty: number
  unit_price: number // per-order-line price
  date: string // YYYY-MM-DD
  delivered?: boolean
  discount?: number
  notes?: string
  product_cost?: number
  shipping_cost?: number
  partner_splits?: Array<{ partner_id: string; amount: number }>
}

export async function createOrder(input: NewOrderInput) {
  const res = await apiFetch(`${base}/api/orders`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save order (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { ok: true; order_id: string; order_no: number }
}

// ---- Payments API (from customers) ----
export type PaymentType =
  | 'Cash payment'
  | 'Cash App payment'
  | 'Wire Transfer'
  | 'Zelle payment'
  | 'Partner credit'
  | 'Loan/Deposit'
  | 'Repayment'

export const PAYMENT_TYPES: PaymentType[] = [
  'Cash payment',
  'Cash App payment',
  'Wire Transfer',
  'Zelle payment',
  'Partner credit',
  'Loan/Deposit',
  'Repayment'
]

export type NewPaymentInput = {
  customer_id: string
  payment_type: PaymentType
  amount: number
  payment_date: string
  notes?: string | null
  order_id?: string | null
}

export async function createPayment(input: NewPaymentInput) {
  const res = await apiFetch(`${base}/api/payments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save payment (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { ok: true; id: string }
}

export async function listPayments(limit = 20) {
  const res = await apiFetch(`${base}/api/payments?limit=${encodeURIComponent(String(limit))}`, {
    cache: 'no-store',
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error(`Failed to load payments (status ${res.status})`)
  return (await res.json()) as {
    payments: Array<{
      id: string
      payment_date: string
      payment_type: PaymentType
      amount: number
      customer_name: string
      customer_id: string
      notes?: string | null
    }>
  }
}

// ---- Partner Payments API (to partners) ----
export type PartnerPaymentType = 'Cash' | 'Cash app' | 'Other' | 'Add to debt'

export const PARTNER_PAYMENT_TYPES: PartnerPaymentType[] = ['Cash', 'Cash app', 'Other', 'Add to debt']

export type NewPartnerPaymentInput = {
  partner_id: string
  payment_type: PartnerPaymentType
  amount: number
  payment_date: string
  notes?: string | null
}

export async function createPartnerPayment(input: NewPartnerPaymentInput) {
  const res = await apiFetch(`${base}/api/partner-payment`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save partner payment (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { ok: true; id: string }
}

// ---- Supplier Payments API (to suppliers) ----
export type SupplierPaymentType = 'Cash' | 'Bank transfer' | 'Check' | 'Credit card' | 'Add to debt' | 'Prepayment' | 'Other'

export const SUPPLIER_PAYMENT_TYPES: SupplierPaymentType[] = [
  'Cash',
  'Bank transfer',
  'Check',
  'Credit card',
  'Add to debt',
  'Prepayment',
  'Other'
]

export type NewSupplierPaymentInput = {
  supplier_id: string
  payment_type: SupplierPaymentType
  amount: number
  payment_date: string
  notes?: string | null
}

export async function createSupplierPayment(input: NewSupplierPaymentInput) {
  const res = await apiFetch(`${base}/api/supplier-payment`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save supplier payment (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { ok: true; id: string }
}

// ---- Customers (with totals/owed) ----
export type CustomerWithOwed = {
  id: string
  name: string
  customer_type?: 'BLV' | 'Partner'
  total_orders: number
  total_payments: number
  owed_to_partners?: number
  owed_to_me: number
}

export async function listCustomersWithOwed(q?: string) {
  const url = `${base}/api/customers` + (q ? `?q=${encodeURIComponent(q)}` : '')
  const res = await apiFetch(url, {
    cache: 'no-store',
    headers: getAuthHeaders()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load customers (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { customers: CustomerWithOwed[] }
}

// ---- Partners (with totals) ----
export type PartnerWithOwed = {
  id: string
  name: string
  total_owed: number
}

export async function listPartnersWithOwed(q?: string) {
  const url = `${base}/api/partners` + (q ? `?q=${encodeURIComponent(q)}` : '')
  const res = await apiFetch(url, {
    cache: 'no-store',
    headers: getAuthHeaders()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load partners (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { partners: PartnerWithOwed[] }
}

// ---- Create/Fetch/Update Customer ----
export type CustomerType = 'BLV' | 'Partner'

export type NewCustomerInput = {
  name: string
  customer_type: CustomerType
  shipping_cost?: number | null
  apply_to_history?: boolean
  company_name?: string | null
  phone?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

export async function createCustomer(input: NewCustomerInput) {
  const res = await apiFetch(`${base}/api/customers`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to create customer (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { ok: true; id: string }
}

export type OrderSummary = {
  id: string
  order_no: number
  order_date: string
  delivered: boolean
  total: number
  lines: number
}

export type PaymentSummary = {
  id: string
  payment_date: string
  payment_type: PaymentType
  amount: number
}

export type CustomerDetail = {
  customer: {
    id: string
    name: string
    customer_type?: 'BLV' | 'Partner'
    shipping_cost?: number | null
    company_name?: string | null
    phone?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
  }
  totals: { total_orders: number; total_payments: number; owed_to_me: number }
  orders: OrderSummary[]
  payments: PaymentSummary[]
}

export async function fetchCustomerDetail(id: string) {
  const res = await apiFetch(`${base}/api/customer?id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: getAuthHeaders()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load customer (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as CustomerDetail
}

export type UpdateCustomerInput = NewCustomerInput & { id: string; effective_date?: string }

export async function updateCustomer(input: UpdateCustomerInput) {
  const res = await apiFetch(`${base}/api/customer`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to update customer (status ${res.status}) ${text?.slice(0, 140)}`)
  }
  return (await res.json()) as { ok: true }
}

// --- Products ---
export async function createProduct(input: { name: string; cost: number }) {
  const res = await apiFetch(`${base}/api/product`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    let msg = `Failed to create product (status ${res.status})`
    try {
      const j = await res.json()
      if (j?.error) msg += `: ${j.error}`
    } catch {}
    throw new Error(msg)
  }
  return res.json() as Promise<{ product: { id: string; name: string; cost: number } }>
}

export type ProductWithCost = { id: string; name: string; cost: number | null }

export async function listProducts(): Promise<{ products: ProductWithCost[] }> {
  const r = await apiFetch(`${base}/api/product`, {
    method: 'GET',
    headers: getAuthHeaders()
  })
  if (!r.ok) throw new Error(`Failed to load products (${r.status})`)
  return r.json()
}

export async function updateProduct(input: {
  id: string
  name?: string
  cost?: number
  apply_to_history?: boolean
  effective_date?: string
}): Promise<{ product: ProductWithCost; applied_to_history?: boolean }> {
  const r = await apiFetch(`${base}/api/product`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(input)
  })
  if (!r.ok) {
    let msg = `Failed to update product (status ${r.status})`
    try {
      const j = await r.json()
      if (j?.error) msg += `: ${j.error}`
    } catch {}
    throw new Error(msg)
  }
  return r.json()
}

// --- Employee Salary ---
export interface EmployeeSalaryUpdate {
  employee_id: string
  salary: number
  apply_to_history?: boolean
  effective_date?: string
}

// ---- Costs ----
export async function getCostCategories(type: 'B' | 'P') {
  const res = await apiFetch(`${base}/api/cost/categories?type=${type}`, {
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error('Failed to fetch cost categories')
  return res.json()
}

export async function getCostTypes(category: string) {
  const res = await apiFetch(`${base}/api/cost/types?category=${encodeURIComponent(category)}`, {
    headers: getAuthHeaders()
  })
  if (!res.ok) throw new Error('Failed to fetch cost types')
  return res.json()
}

export async function createCost(costData: {
  business_private: 'B' | 'P'
  cost_category: string
  cost_type: string
  cost: string
  amount: number
  cost_date?: string
  start_date?: string
  end_date?: string | null
  recur_kind?: 'monthly' | 'weekly' | 'yearly'
  recur_interval?: number
}) {
  const res = await apiFetch(`${base}/api/cost`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(costData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create cost' }))
    throw new Error(err.error || err.message || 'Failed to create cost')
  }
  return res.json()
}

export async function getExistingCosts(businessPrivate: 'B' | 'P') {
  const response = await apiFetch(`${base}/api/cost/existing?type=${businessPrivate}`, {
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch existing costs')
  }
  return response.json()
}

export async function updateCost(
  costId: number | string,
  costType: 'recurring' | 'non-recurring',
  costData: {
    business_private: 'B' | 'P'
    cost_category: string
    cost_type: string
    cost: string
    amount: number
    cost_date?: string
    start_date?: string
    end_date?: string | null
    recur_kind?: 'monthly' | 'weekly' | 'yearly'
    recur_interval?: number
  }
) {
  const url = `${base}/api/cost?id=${costId}&type=${costType}`

  console.log('=== API UPDATE COST ===')
  console.log('Constructed URL:', url)
  console.log('costId:', costId, 'type:', typeof costId)
  console.log('costType:', costType)

  const response = await apiFetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(costData)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update cost' }))
    console.error('Update cost failed:', error)
    throw new Error(error.error || 'Failed to update cost')
  }
  return response.json()
}

export async function deleteCost(costId: number | string, costType: 'recurring' | 'non-recurring') {
  const response = await apiFetch(`${base}/api/cost?id=${costId}&type=${costType}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete cost' }))
    throw new Error(error.error || 'Failed to delete cost')
  }
  return response.json()
}
