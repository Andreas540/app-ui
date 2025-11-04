// src/pages/EditOrderSupplier.tsx
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

type Product = { id: string; name: string }

type Line = {
  id: string
  product_id: string
  qty: string
  cost: string
  lastCost?: number | null
}

const todayYMD = () => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Accept "," or "." then normalize to "."
function parsePriceToNumber(s: string) {
  const m = (s ?? '').match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return NaN
  return Number(m[0].replace(',', '.'))
}

// Detect a brand-new fully blank line (ignore for validation/payload)
function isBrandNewBlank(l: Line) {
  const hasId = !!(l.id && l.id.trim())
  const hasAny = (l.product_id && l.product_id.trim()) || (l.qty && l.qty.trim()) || (l.cost && l.cost.trim())
  return !hasId && !hasAny
}

// Normalize any qty-like value to an integer string (e.g. "5000.000" -> "5000")
function toQtyIntString(v: any): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  const t = Math.trunc(n)
  return t > 0 ? String(t) : ''
}

export default function EditOrderSupplier() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Header
  const [orderNo, setOrderNo] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [delivered, setDelivered] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [received, setReceived] = useState(false)
  const [receivedDate, setReceivedDate] = useState('')
  const [inCustoms, setInCustoms] = useState(false)
  const [inCustomsDate, setInCustomsDate] = useState('')
  const [orderDate, setOrderDate] = useState(todayYMD())
  const [estDeliveryDate, setEstDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')

  // Lines
  const [lines, setLines] = useState<Line[]>([])

  // Load products and order data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

        // Load products
        const pRes = await fetch(`${base}/api/product`, { cache: 'no-store' })
        if (pRes.ok) {
          const data = await pRes.json()
          setProducts((data.products || []).map((p: any) => ({ id: p.id, name: p.name })))
        } else {
          setProducts([])
        }

        // Load order data
        if (!id) throw new Error('Order ID missing')
        
        const orderRes = await fetch(`${base}/api/order-supplier?id=${id}`, { cache: 'no-store' })
        if (!orderRes.ok) throw new Error('Failed to load order')
        
        const orderData = await orderRes.json()
        const order = orderData.order
        
        // Populate form with order data
        setOrderNo(order.order_no)
        setSupplierId(order.supplier_id)
        setSupplierName(order.supplier_name)
        setDelivered(order.delivered || false)
        setDeliveryDate(order.delivery_date ? order.delivery_date.split('T')[0] : '')
        setReceived(order.received || false)
        setReceivedDate(order.received_date ? order.received_date.split('T')[0] : '')
        setInCustoms(order.in_customs || false)
        setInCustomsDate(order.in_customs_date ? order.in_customs_date.split('T')[0] : '')
        setOrderDate(order.order_date ? order.order_date.split('T')[0] : todayYMD())
        setEstDeliveryDate(order.est_delivery_date ? order.est_delivery_date.split('T')[0] : '')
        setNotes(order.notes || '')
        
        // Load order items — normalize qty to integer string so UI/validation accept it
        if (orderData.items && orderData.items.length > 0) {
          setLines(
            orderData.items.map((item: any) => ({
              id: item.id,
              product_id: item.product_id,
              qty: toQtyIntString(item.qty), // <-- normalize "5000.000" -> "5000"
              cost: String(item.product_cost ?? '').replace(',', '.'), // normalize just in case
              lastCost: null,
            }))
          )
        }
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // Fetch last cost for a given supplier+product
  async function fetchLastCostFor(lineIdx: number, supplier_id: string, product_id: string) {
    try {
      if (!supplier_id || !product_id) {
        setLines((prev) => prev.map((l, i) => (i === lineIdx ? { ...l, lastCost: null } : l)))
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
      setLines((prev) => prev.map((l, i) => (i === lineIdx ? { ...l, lastCost: Number.isFinite(last) ? last : null } : l)))
    } catch {
      setLines((prev) => prev.map((l, i) => (i === lineIdx ? { ...l, lastCost: null } : l)))
    }
  }

  function addProductBlock() {
    setLines((prev) => [...prev, { id: '', product_id: '', qty: '', cost: '', lastCost: null }])
  }

  function removeProductBlock(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  // Refresh last costs for selected products when supplier changes
  useEffect(() => {
    if (!supplierId) {
      setLines((prev) => prev.map((l) => ({ ...l, lastCost: null })))
      return
    }
    lines.forEach((l, i) => {
      if (l.product_id) fetchLastCostFor(i, supplierId, l.product_id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId])

  // Consider only "relevant" lines:
  const relevantLines = useMemo(
    () => lines.filter(l => !!l.id || !isBrandNewBlank(l)),
    [lines]
  )

  // Require supplier, at least one relevant line, and ALL relevant lines valid
  const canSave = useMemo(() => {
    if (!supplierId) return false
    if (relevantLines.length === 0) return false
    return relevantLines.every((l) => {
      const qtyInt = /^[1-9]\d*$/.test(l.qty)
      const dot = (l.cost ?? '').replace(',', '.')
      const costOk = dot !== '' && /^-?\d+(\.\d{1,3})?$/.test(dot)
      return !!l.product_id && qtyInt && costOk
    })
  }, [supplierId, relevantLines])

  // Reason helper (used for the tooltip)
  const disableReason = useMemo(() => {
    if (supplierId === '') return 'Missing supplier'
    if (relevantLines.length === 0) return 'Add at least one product line'
    for (const l of relevantLines) {
      if (!l.product_id) return 'Pick product'
      if (!/^[1-9]\d*$/.test(l.qty || '')) return 'Qty must be integer ≥ 1'
      const dot = (l.cost ?? '').replace(',', '.')
      if (!(dot !== '' && /^-?\d+(\.\d{1,3})?$/.test(dot))) return 'Cost must be number (max 3 decimals)'
    }
    return ''
  }, [supplierId, relevantLines])

  async function handleSave() {
    if (!canSave) {
      alert('Select a supplier and make every line valid: product, integer qty, and a cost (≤3 decimals).')
      return
    }
    try {
      setSaving(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      // Map ALL relevant lines (no filter): server deletes then inserts exactly what we send
      const cleanLines = relevantLines.map((l) => {
        const cost = parsePriceToNumber(l.cost)
        return {
          id: l.id || undefined,
          product_id: l.product_id,
          qty: Number(toQtyIntString(l.qty)), // ensure integer
          product_cost: Number(cost.toFixed(3)),
          shipping_cost: 0,
        }
      })

      const body = {
        id,
        supplier_id: supplierId,
        delivered,
        delivery_date: delivered && deliveryDate ? deliveryDate : null,
        received,
        received_date: received && receivedDate ? receivedDate : null,
        in_customs: inCustoms,
        in_customs_date: inCustoms && inCustomsDate ? inCustomsDate : null,
        order_date: orderDate || null,
        est_delivery_date: estDeliveryDate || null,
        notes: notes?.trim() || null,
        lines: cleanLines,
      }

      const res = await fetch(`${base}/api/order-supplier`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Save failed (${res.status}) ${t?.slice(0, 200)}`)
      }
      alert('Supplier order updated.')
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete Order #${orderNo}? This cannot be undone.`)) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order-supplier`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete order')

      alert('Order deleted')
      navigate('/suppliers')
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>Edit Order (S)</h3>
          <div className="helper" style={{ marginTop: 4 }}>Order #{orderNo}</div>
        </div>
      </div>

      {/* Supplier row (read-only) */}
      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ width: '100%' }}>
          <label>Supplier</label>
          <input type="text" value={supplierName} readOnly style={{ opacity: 0.9 }} />
        </div>
      </div>

      {/* Repeating product blocks */}
      {lines.map((l, idx) => (
        <div key={idx} style={{ borderTop: idx === 0 ? 'none' : '1px solid #eee', marginTop: idx === 0 ? 12 : 16, paddingTop: idx === 0 ? 0 : 12 }}>
          {/* Product & Quantity */}
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
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantity</label>
              <input
                type="text"
                inputMode="numeric"
                value={l.qty}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^[0-9]+$/.test(v)) updateLine(idx, { qty: v })
                }}
                onBlur={(e) => {
                  // normalize any accidental decimals pasted/typed into an int string
                  const norm = toQtyIntString(e.target.value)
                  updateLine(idx, { qty: norm })
                }}
              />
            </div>
          </div>

          {/* Cost & Cost last time */}
          <div className="row row-2col-mobile" style={{ marginTop: 6 }}>
            <div>
              <label>Cost</label>
              <input
                type="text"
                inputMode="decimal"
                value={l.cost}
                onChange={(e) => {
                  const raw = e.target.value
                  const dot = raw.replace(',', '.')
                  if (dot === '' || /^-?\d+(\.\d{0,3})?$/.test(dot)) updateLine(idx, { cost: dot })
                }}
              />
            </div>
            <div>
              <label>Cost last time</label>
              <input type="text" value={l.lastCost == null ? '' : Number(l.lastCost).toFixed(3)} readOnly disabled />
            </div>
          </div>

          {/* Add / Remove product controls */}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              aria-label="Add product"
              title="Add product"
              className="primary"
              onClick={addProductBlock}
              style={{ height: 36, width: 36, padding: 0, borderRadius: '50%', lineHeight: '36px', textAlign: 'center' }}
            >
              +
            </button>
            <span className="helper">Add product</span>

            <button
              aria-label="Remove product"
              title="Remove product"
              className="primary"
              onClick={() => removeProductBlock(idx)}
              style={{ height: 36, width: 36, padding: 0, borderRadius: '50%', lineHeight: '36px', textAlign: 'center', marginLeft: 12 }}
            >
              –
            </button>
            <span className="helper">Remove product</span>
          </div>
        </div>
      ))}

      {/* Status checkboxes with date fields */}
      <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
        <div className="helper" style={{ marginBottom: 8, fontWeight: 600 }}>Order Status</div>
        
        {/* Delivered */}
        <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={delivered}
                onChange={(e) => {
                  setDelivered(e.target.checked)
                  if (!e.target.checked) setDeliveryDate('')
                }}
                style={{ width: 14, height: 14 }}
              />
              Delivered
            </label>
          </div>
          <div>
            <label>Delivery date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              disabled={!delivered}
              style={{ opacity: delivered ? 1 : 0.5 }}
            />
          </div>
        </div>

        {/* In Customs */}
        <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={inCustoms}
                onChange={(e) => {
                  setInCustoms(e.target.checked)
                  if (!e.target.checked) setInCustomsDate('')
                }}
                style={{ width: 14, height: 14 }}
              />
              In Customs
            </label>
          </div>
          <div>
            <label>In customs date</label>
            <input
              type="date"
              value={inCustomsDate}
              onChange={(e) => setInCustomsDate(e.target.value)}
              disabled={!inCustoms}
              style={{ opacity: inCustoms ? 1 : 0.5 }}
            />
          </div>
        </div>

        {/* Received */}
        <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={received}
                onChange={(e) => {
                  setReceived(e.target.checked)
                  if (!e.target.checked) setReceivedDate('')
                }}
                style={{ width: 14, height: 14 }}
              />
              Received
            </label>
          </div>
          <div>
            <label>Received date</label>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              disabled={!received}
              style={{ opacity: received ? 1 : 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Order date</label>
          <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <label>Est. delivery date</label>
          <input type="date" value={estDeliveryDate} onChange={(e) => setEstDeliveryDate(e.target.value)} />
        </div>
      </div>

      {/* Notes */}
      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ width: '100%' }}>
          <label>Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="primary"
          onClick={handleSave}
          disabled={!canSave || saving}
          title={!canSave ? (disableReason || 'All lines must be valid') : 'Click to save'}
          style={{ height: 'var(--control-h)' }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={() => navigate(-1)} style={{ height: 'var(--control-h)' }}>
          Cancel
        </button>
        <button
          onClick={handleDelete}
          style={{
            height: 'var(--control-h)',
            marginLeft: 'auto',
            backgroundColor: 'salmon',
            color: 'white',
            border: 'none',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}





