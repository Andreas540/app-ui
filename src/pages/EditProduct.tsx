import { useEffect, useMemo, useState } from 'react'
import { listProducts, updateProduct, type ProductWithCost } from '../lib/api'
import { todayYMD } from '../lib/time'

export default function EditProduct() {
  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [costStr, setCostStr] = useState('') // decimal string
  const [costOption, setCostOption] = useState<'history' | 'next' | 'specific'>('next')
  const [specificDate, setSpecificDate] = useState<string>(todayYMD())
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
    setCostOption('next')
    setSpecificDate(todayYMD())
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

    if (costOption === 'specific' && !specificDate) {
      alert('Please select a date')
      return
    }

    try {
      setSaving(true)
      const res = await updateProduct({
        id: selected.id,
        name,
        cost: costNum,
        apply_to_history: costOption === 'history',
        effective_date: costOption === 'specific' ? specificDate : undefined,
      })
      
      let message = `Updated "${res.product.name}"`
      if (res.applied_to_history) {
        message += ' (applied to all previous orders)'
      } else if (costOption === 'specific') {
        message += ` (effective from ${specificDate})`
      }
      
      alert(message)
      
      // refresh the list to reflect any name/cost changes
      const { products } = await listProducts()
      setProducts(products)
      setSelectedId(res.product.id)
      setCostOption('next')
      setSpecificDate(todayYMD())
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

      <div style={{ marginTop: 12 }}>
        <label>New product cost (USD)</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={costStr}
          onChange={e=>setCostStr(parseCostInput(e.target.value))}
        />
      </div>

      {/* Cost application options */}
      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'history'}
            onChange={() => setCostOption('history')}
            style={{ width: 18, height: 18 }}
          />
          <span>Apply new cost to all previous orders</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'next'}
            onChange={() => setCostOption('next')}
            style={{ width: 18, height: 18 }}
          />
          <span>New cost valid from next order</span>
        </label>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="radio"
              name="costOption"
              checked={costOption === 'specific'}
              onChange={() => setCostOption('specific')}
              style={{ width: 18, height: 18 }}
            />
            <span>Valid from specific date</span>
          </label>
          
          {costOption === 'specific' && (
            <div style={{ marginTop: 8, marginLeft: 28 }}>
              <input
                type="date"
                value={specificDate}
                onChange={e => setSpecificDate(e.target.value)}
                style={{ width: '100%', maxWidth: 200 }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving} style={{ height: BTN_H }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button 
          onClick={() => { 
            if (selected) { 
              setNewName(selected.name); 
              setCostStr(selected.cost == null ? '' : String(selected.cost)); 
            } 
            setCostOption('next'); 
            setSpecificDate(todayYMD());
          }} 
          disabled={saving}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

