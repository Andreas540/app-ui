// src/pages/NewProduct.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createProduct, listProducts, type ProductWithCost } from '../lib/api'

export default function NewProduct() {
  const [name, setName] = useState('')
  const [costStr, setCostStr] = useState('')  // decimal string
  const [saving, setSaving] = useState(false)

  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loadingList, setLoadingList] = useState(false)

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  async function loadProducts() {
    try {
      setLoadingList(true)
      const { products: raw } = await listProducts()       // <- unpack old shape
      const rows = raw.slice().sort((a, b) => a.name.localeCompare(b.name))
      setProducts(rows)
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  async function save() {
    const nm = name.trim()
    const costNum = Number((costStr || '').replace(',', '.'))
    if (!nm) { alert('Enter product name'); return }
    if (!Number.isFinite(costNum) || costNum < 0) { alert('Enter a valid cost ≥ 0'); return }

    try {
      setSaving(true)
      await createProduct({ name: nm, cost: costNum })
      alert('Product created!')
      setName('')
      setCostStr('')
      await loadProducts() // refresh the list
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const BTN_H = 'calc(var(--control-h) * 0.67)'

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

      {/* ---- Product costs list ---- */}
      <hr style={{ margin: '20px 0' }} />
      <h4 style={{ margin: '0 0 8px 0' }}>Product costs</h4>

      <div
        role="list"
        aria-busy={loadingList}
        style={{ display: 'grid', gap: 6 }}
      >
        {loadingList && <div>Loading…</div>}
        {!loadingList && products.length === 0 && (
          <div style={{ opacity: 0.7 }}>No products yet.</div>
        )}
        {!loadingList && products.map(p => (
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
    </div>
  )
}



