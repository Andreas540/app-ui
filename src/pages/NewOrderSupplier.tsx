// src/pages/NewOrderSupplier.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

type Supplier = { id: string; name: string }
type Product  = { id: string; name: string }

type Line = {
  product_id: string | ''
  qty: string            // integer as string for input control
  cost: string           // up to 3 decimals as string
  lastCost?: number | null
}

const todayYMD = () => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export default function NewOrderSupplier() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products,  setProducts]  = useState<Product[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState<string | null>(null)

  // Header
  const [supplierId, setSupplierId] = useState('')
  const [delivered, setDelivered]   = useState(false)
  const [received, setReceived]     = useState(false)
  const [inCustoms, setInCustoms]   = useState(false)
  const [orderDate, setOrderDate]   = useState(todayYMD())
  const [estDeliveryDate, setEstDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')

  // Lines
  const [lines, setLines] = useState<Line[]>([{ product_id:'', qty:'', cost:'', lastCost:null }])

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

        const [sRes, pRes] = await Promise.allSettled([
          fetch(`${base}/api/suppliers`, { cache: 'no-store' }),
          fetch(`${base}/api/product`, { cache: 'no-store' }),
        ])

        if (sRes.status === 'fulfilled' && sRes.value.ok) {
          const data = await sRes.value.json()
          setSuppliers((data.suppliers || []).map((s: any)=>({id:s.id, name:s.name})))
        } else {
          throw new Error('Failed to load suppliers')
        }

        if (pRes.status === 'fulfilled' && pRes.value.ok) {
          const data = await pRes.value.json()
          setProducts((data.products || []).map((p:any)=>({id:p.id, name:p.name})))
        } else {
          setProducts([])
        }
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Pre-fill supplier from URL if provided
  useEffect(() => {
    const supplierIdParam = searchParams.get('supplier_id')
    if (supplierIdParam) {
      setSupplierId(supplierIdParam)
    }
  }, [])

  // Fetch last cost for a given supplier+product
  async function fetchLastCostFor(lineIdx: number, supplier_id: string, product_id: string) {
    try {
      if (!supplier_id || !product_id) {
        setLines(prev => prev.map((l,i)=> i===lineIdx ? { ...l, lastCost: null } : l))
        return
      }
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const url = new URL(`${base}/api/order-supplier`, window.location.origin)
      url.searchParams.set('fn', 'last-cost')
      url.searchParams.set('supplier_id', supplier_id)
      url.searchParams.set('product_id', product_id)
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error('last-cost fetch failed')
      const data = await res.json()
      const last = Number(data?.last_cost ?? 0)
      setLines(prev => prev.map((l,i)=> i===lineIdx ? { ...l, lastCost: Number.isFinite(last) ? last : null } : l))
    } catch {
      setLines(prev => prev.map((l,i)=> i===lineIdx ? { ...l, lastCost: null } : l))
    }
  }

  function addProductBlock() {
    setLines(prev => [...prev, { product_id:'', qty:'', cost:'', lastCost:null }])
  }
  function removeProductBlock(idx: number) {
    setLines(prev => prev.length > 1 ? prev.filter((_,i)=>i!==idx) : prev)
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l,i)=> i===idx ? { ...l, ...patch } : l))
  }

  // Refresh last costs for selected products when supplier changes
  useEffect(() => {
    if (!supplierId) {
      setLines(prev => prev.map(l => ({...l, lastCost: null})))
      return
    }
    lines.forEach((l, i) => { if (l.product_id) fetchLastCostFor(i, supplierId, l.product_id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId])

  const canSave = useMemo(() => {
    if (!supplierId) return false
    return lines.some(l => {
      const qtyInt = /^[1-9]\d*$/.test(l.qty) // integer >=1
      const costOk = l.cost !== '' && /^-?\d+(\.\d{1,3})?$/.test(l.cost)
      return l.product_id && qtyInt && costOk
    })
  }, [supplierId, lines])

  async function handleSave() {
    if (!canSave) { alert('Select a supplier and add at least one product with integer qty and a cost (≤3 decimals).'); return }
    try {
      setSaving(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const cleanLines = lines
        .filter(l => l.product_id && /^[1-9]\d*$/.test(l.qty) && l.cost !== '' && /^-?\d+(\.\d{1,3})?$/.test(l.cost))
        .map(l => ({
          product_id: l.product_id,
          qty: Number(l.qty),
          product_cost: Number(Number(l.cost).toFixed(3)),
          shipping_cost: 0,
        }))

      const body = {
        supplier_id: supplierId,
        delivered, received, in_customs: inCustoms,
        order_date: orderDate || null,
        est_delivery_date: estDeliveryDate || null,
        notes: notes?.trim() || null,
        lines: cleanLines,
      }

      const res = await fetch(`${base}/api/order-supplier`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text().catch(()=> '')
        throw new Error(`Save failed (${res.status}) ${t?.slice(0,140)}`)
      }
      alert('Supplier order saved.')
      navigate('/suppliers')
    } catch (e:any) {
      alert(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleClear() {
    setSupplierId('')
    setDelivered(false); setReceived(false); setInCustoms(false)
    setOrderDate(todayYMD()); setEstDeliveryDate('')
    setNotes('')
    setLines([{ product_id:'', qty:'', cost:'', lastCost:null }])
  }

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <h3>New Order (S)</h3>

      {err && <p style={{ color:'salmon' }}>Error: {err}</p>}
      {loading ? <p>Loading…</p> : (
        <>
          {/* Supplier row (stacks on mobile) */}
          <div className="row" style={{ marginTop: 12 }}>
            <div style={{ width: '100%' }}>
              <label>Choose supplier</label>
              <select value={supplierId} onChange={e=>setSupplierId(e.target.value)}>
                <option value="">Select…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Repeating product blocks */}
          {lines.map((l, idx) => (
            <div key={idx} style={{ borderTop: idx===0 ? 'none':'1px solid #eee', marginTop: idx===0? 12 : 16, paddingTop: idx===0? 0 : 12 }}>
              {/* Product & Quantity: force 2 cols even on mobile */}
              <div className="row row-2col-mobile" style={{ marginTop: 6 }}>
                <div>
                  <label>Product</label>
                  <select
                    value={l.product_id}
                    onChange={(e) => {
                      const val = e.target.value
                      updateLine(idx, { product_id: val })
                      if (val && supplierId) fetchLastCostFor(idx, supplierId, val)
                      else updateLine(idx, { lastCost: null })
                    }}
                  >
                    <option value="">Select…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Quantity</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    value={l.qty}
                    onChange={e => {
                      const v = e.target.value
                      if (v === '' || /^[0-9]+$/.test(v)) updateLine(idx, { qty: v })
                    }}
                  />
                </div>
              </div>

              {/* Cost & Cost last time: force 2 cols even on mobile */}
              <div className="row row-2col-mobile" style={{ marginTop: 6 }}>
                <div>
                  <label>Cost</label>
                  <input
                    type="number"
                    step="0.001"
                    value={l.cost}
                    onChange={e => {
                      const v = e.target.value
                      if (v === '' || /^-?\d+(\.\d{0,3})?$/.test(v)) updateLine(idx, { cost: v })
                    }}
                  />
                </div>
                <div>
                  <label>Cost last time</label>
                  <input
                    type="text"
                    value={l.lastCost == null ? '' : Number(l.lastCost).toFixed(3)}
                    readOnly
                    disabled
                  />
                </div>
              </div>

              {/* Add / Remove product controls */}
              <div style={{ marginTop: 8, display:'flex', gap:12, alignItems:'center' }}>
                <button
                  aria-label="Add product"
                  title="Add product"
                  className="primary"
                  onClick={addProductBlock}
                  style={{ height: 36, width: 36, padding: 0, borderRadius: '50%', lineHeight: '36px', textAlign: 'center' }}
                >+</button>
                <span className="helper">Add product</span>

                <button
                  aria-label="Remove product"
                  title="Remove product"
                  className="primary"
                  onClick={() => removeProductBlock(idx)}
                  style={{ height: 36, width: 36, padding: 0, borderRadius: '50%', lineHeight: '36px', textAlign: 'center', marginLeft: 12 }}
                >–</button>
                <span className="helper">Remove product</span>
              </div>
            </div>
          ))}

          {/* Checkboxes (smaller) */}
          <div style={{ marginTop: 12, display:'flex', gap:18, alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={delivered} onChange={e=>setDelivered(e.target.checked)} style={{ width:14, height:14 }} />
              Delivered
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={received} onChange={e=>setReceived(e.target.checked)} style={{ width:14, height:14 }} />
              Received
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={inCustoms} onChange={e=>setInCustoms(e.target.checked)} style={{ width:14, height:14 }} />
              In Customs
            </label>
          </div>

          {/* Dates (stack on mobile; 50/50 on desktop via your base .row) */}
          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Order date</label>
              <input type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)} />
            </div>
            <div>
              <label>Est. delivery date</label>
              <input type="date" value={estDeliveryDate} onChange={e=>setEstDeliveryDate(e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="row" style={{ marginTop: 12 }}>
            <div style={{ width:'100%' }}>
              <label>Notes</label>
              <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ marginTop: 16, display:'flex', gap:8 }}>
            <button className="primary" onClick={handleSave} disabled={!canSave || saving} style={{ height: 'var(--control-h)' }}>
              {saving ? 'Saving…' : 'Save order'}
            </button>
            <button onClick={handleClear} style={{ height: 'var(--control-h)' }}>Clear</button>
          </div>
        </>
      )}
    </div>
  )
}

