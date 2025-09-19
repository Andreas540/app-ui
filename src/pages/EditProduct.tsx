import { useEffect, useMemo, useState } from 'react'
import { listProducts, updateProduct, type ProductWithCost } from '../lib/api'

export default function EditProduct() {
  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [costStr, setCostStr] = useState('') // decimal string
  const [applyHistory, setApplyHistory] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { products } = await listProducts()
        setProducts(products)
        // default selection
        if (products.length) setSelectedId(products[0].id)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selected = useMemo(() => products.find(p => p.id === selectedId) || null, [products, selectedId])

  // When product changes, prefill fields
  useEffect(() => {
    if (!selected) return
    setNewName(selected.name)
    setCostStr(selected.cost == null ? '' : String(selected.cost))
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function parseCostInput(s: string) {
    const cleaned = s.replace(/[^\d.,-]/g, '')
    return cleaned.replace(',', '.') // normalize comma to dot
  }

  async function save() {
    if (!selected) { alert('Pick a product'); return }
    const name = (newName || '').trim()
    if (!name) { alert('Enter a product name'); return }
    const costNum = Number((costStr || '').replace(',', '.'))
    if (!Number.isFinite(costNum) || costNum < 0) { alert('Enter a valid cost ≥ 0'); return }

    try {
      setSaving(true)
      const res = await updateProduct({
        id: selected.id,
        name,
        cost: costNum,
        apply_to_history: applyHistory,
      })
      alert(`Updated "${res.product.name}"${res.applied_to_history ? ' (applied to history)' : ''}`)
      // refresh the list to reflect any name/cost changes
      const { products } = await listProducts()
      setProducts(products)
      setSelectedId(res.product.id)
      setApplyHistory(false)
    } catch (e:any) {
      alert(e?.message || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!products.length) return <div className="card"><p>No products yet.</p></div>

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0 }}>Edit Product</h3>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Product</label>
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label>New name</label>
          <input
            type="text"
            placeholder="e.g. ACE Ultra"
            value={newName}
            onChange={e=>setNewName(e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>New product cost (USD)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={costStr}
            onChange={e=>setCostStr(parseCostInput(e.target.value))}
          />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <input
            id="applyHistory"
            type="checkbox"
            checked={applyHistory}
            onChange={e=>setApplyHistory(e.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          <label htmlFor="applyHistory" style={{ margin: 0 }}>Apply new cost to previous orders</label>
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving} style={{ height: BTN_H }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={() => { if (selected) { setNewName(selected.name); setCostStr(selected.cost == null ? '' : String(selected.cost)); } setApplyHistory(false); }} disabled={saving}>
          Reset
        </button>
      </div>
    </div>
  )
}

