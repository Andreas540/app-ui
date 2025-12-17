// src/pages/PriceChecker.tsx
import { useEffect, useState } from 'react'
import { fetchBootstrap, type Person, type Product, getAuthHeaders } from '../lib/api'

type PriceData = {
  price_last_time: number | null
  average_price: number | null
  order_count: number
}

export default function PriceChecker() {
  const [customers, setCustomers] = useState<Person[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load customers and products on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { customers, products } = await fetchBootstrap()
        setCustomers(customers)
        setProducts(products)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Fetch price data when both customer and product are selected
  useEffect(() => {
    if (!selectedCustomerId || !selectedProductId) {
      setPriceData(null)
      return
    }

    (async () => {
      try {
        setDataLoading(true)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const res = await fetch(
  `${base}/api/price-checker?customer_id=${selectedCustomerId}&product_id=${selectedProductId}`,
  { 
    cache: 'no-store',
    headers: getAuthHeaders(),
  }
)
        
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to fetch price data (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        setPriceData(data)
      } catch (e: any) {
        console.error('Price data error:', e)
        setPriceData(null)
      } finally {
        setDataLoading(false)
      }
    })()
  }, [selectedCustomerId, selectedProductId])

  const fmtMoney = (n: number | null) => {
    if (n === null || n === undefined) return '—'
    return `$${Number(n).toFixed(2)}`
  }

  if (loading) return <div className="card"><p>Loading...</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>

  const showResults = selectedCustomerId && selectedProductId

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ margin: 0, marginBottom: 16 }}>Price Checker</h3>

      {/* Filters */}
      <div className="row row-2col-mobile" style={{ gap: 12 }}>
        <div>
          <label>Customer</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Product</label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">— Select product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {showResults && (
        <div style={{ marginTop: 24 }}>
          {dataLoading ? (
            <p className="helper">Loading price data...</p>
          ) : priceData ? (
            <div style={{ display: 'grid', gap: 20 }}>
              {/* Price last time */}
              <div>
                <div className="helper" style={{ marginBottom: 8 }}>
                  Price last time
                </div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>
                  {fmtMoney(priceData.price_last_time)}
                </div>
              </div>

              {/* Average price */}
              <div>
                <div className="helper" style={{ marginBottom: 8 }}>
                  Average price
                </div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>
                  {fmtMoney(priceData.average_price)}
                </div>
                <div className="helper" style={{ marginTop: 8 }}>
                  {priceData.order_count} previous {priceData.order_count === 1 ? 'order' : 'orders'} for this product
                </div>
              </div>
            </div>
          ) : (
            <p className="helper">No price data available for this combination.</p>
          )}
        </div>
      )}

      {!showResults && (
        <p className="helper" style={{ marginTop: 24 }}>
          Select both a customer and a product to view price data.
        </p>
      )}
    </div>
  )
}