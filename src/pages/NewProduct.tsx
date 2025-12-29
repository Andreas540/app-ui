// src/pages/NewProduct.tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createProduct, listProducts, type ProductWithCost, getAuthHeaders } from '../lib/api'
import { formatUSAny } from '../lib/time'

interface HistoricalCost {
  product_id: string
  product_name: string
  cost: number
  effective_from: string
}

export default function NewProduct() {
  const [name, setName] = useState('')
  const [costStr, setCostStr] = useState('')  // decimal string
  const [saving, setSaving] = useState(false)

  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loadingList, setLoadingList] = useState(false)
  
  const [showHistorical, setShowHistorical] = useState(false)
  const [historicalCosts, setHistoricalCosts] = useState<HistoricalCost[]>([])
  const [loadingHistorical, setLoadingHistorical] = useState(false)

  // Filter out specific products from current costs view
  const filteredProducts = useMemo(() => {
    const excludedNames = ['boutiq', 'perfect day_2', 'muha meds', 'clouds', 'mix pack', 'bodega boys', 'hex fuel']
    return products.filter(p => !excludedNames.includes(p.name.toLowerCase()))
  }, [products])

  function parseCostInput(s: string) {
    const cleaned = s.replace(/[^\d.,]/g, '')
    const normalized = cleaned.replace(',', '.')
    return normalized
  }

  function fmtMoney(n: number) {
    const v = Number(n) || 0
    return v.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    })
  }

  async function loadProducts() {
    try {
      setLoadingList(true)
      const { products: raw } = await listProducts()
      const rows = raw.slice().sort((a, b) => a.name.localeCompare(b.name))
      setProducts(rows)
    } finally {
      setLoadingList(false)
    }
  }

    async function loadHistoricalCosts() {
    try {
      setLoadingHistorical(true)

      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const res = await fetch(`${base}/api/product-cost-history`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error('Failed to load historical costs')
      const data = await res.json()
      setHistoricalCosts(Array.isArray(data) ? data : [])
    } catch (e: any) {
      alert(e?.message || 'Failed to load historical costs')
    } finally {
      setLoadingHistorical(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    if (showHistorical) {
      loadHistoricalCosts()
    }
  }, [showHistorical])

  async function save() {
    const nm = name.trim()
    const costNum = Number(parseCostInput(costStr || ''))
    if (!nm) { alert('Enter product name'); return }
    if (!Number.isFinite(costNum) || costNum < 0) { alert('Enter a valid cost ≥ 0'); return }

    try {
      setSaving(true)
      await createProduct({ name: nm, cost: costNum })
      alert('Product created!')
      setName('')
      setCostStr('')
      await loadProducts()
      if (showHistorical) {
        await loadHistoricalCosts()
      }
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  // Group historical costs by product
  const groupedHistorical = historicalCosts.reduce((acc, item) => {
    if (!acc[item.product_name]) {
      acc[item.product_name] = []
    }
    acc[item.product_name].push(item)
    return acc
  }, {} as Record<string, HistoricalCost[]>)

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0 }}>New Product</h3>
        <Link to="/products/edit">
          <button className="primary" style={{ height: BTN_H }}>Edit Product(s)</button>
        </Link>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Product name</label>
          <input
            type="text"
            placeholder="e.g. ACE Ultra"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label>Product cost (USD)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={costStr}
            onChange={e => setCostStr(parseCostInput(e.target.value))}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save product'}
        </button>
        <button onClick={() => { setName(''); setCostStr(''); }} disabled={saving}>
          Clear
        </button>
      </div>

      {/* ---- Product costs section ---- */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8, marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>Product costs</h4>
          <button 
            className="primary" 
            onClick={() => setShowHistorical(!showHistorical)}
            style={{ height: BTN_H, minWidth: 140 }}
          >
            {showHistorical ? 'Current costs' : 'Historical costs'}
          </button>
        </div>

        {!showHistorical ? (
          // Current costs view - using filtered products
          <div
            role="list"
            aria-busy={loadingList}
            style={{ display: 'grid', gap: 6 }}
          >
            {loadingList && <div>Loading…</div>}
            {!loadingList && filteredProducts.length === 0 && (
              <div style={{ opacity: 0.7 }}>No products yet.</div>
            )}
            {!loadingList && filteredProducts.map(p => (
              <div
                key={p.id}
                role="listitem"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border, #e6e6e6)'
                }}
                title={p.name}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(p.cost ?? 0)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Historical costs view - showing all products (no filter)
          <div
            role="list"
            aria-busy={loadingHistorical}
            style={{ display: 'grid', gap: 12 }}
          >
            {loadingHistorical && <div>Loading…</div>}
            {!loadingHistorical && historicalCosts.length === 0 && (
              <div style={{ opacity: 0.7 }}>No historical costs yet.</div>
            )}
            {!loadingHistorical && Object.keys(groupedHistorical).sort().map(productName => (
              <div 
                key={productName}
                style={{ 
                  borderBottom: '2px solid var(--border, #e6e6e6)',
                  paddingBottom: 8 
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {productName}
                </div>
                {groupedHistorical[productName]
                  .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())
                  .map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '100px 1fr auto',
                        alignItems: 'center',
                        padding: '4px 0 4px 16px',
                        gap: 12,
                        fontSize: 14,
                        opacity: 0.9
                      }}
                    >
                      <div className="helper">
                        {formatUSAny(item.effective_from)}
                      </div>
                      <div></div>
                      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoney(item.cost)}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



