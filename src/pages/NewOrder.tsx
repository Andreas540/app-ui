import { useEffect, useMemo, useState } from 'react'
import { addOrder, nextOrderNo } from '../lib/storage'
import { fetchBootstrap, type Person, type Product } from '../lib/api'

export default function NewOrder() {
  const [people, setPeople] = useState<Person[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // controls
  const [entityId, setEntityId] = useState<string>('')   // customer/partner id
  const [productId, setProductId] = useState<string>('')
  const [qtyStr, setQtyStr] = useState('')               // quantity as string
  const qty = qtyStr === '' ? 0 : Math.max(0, parseInt(qtyStr, 10) || 0)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0,10))

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { customers, products } = await fetchBootstrap()
        console.log('bootstrap payload:', { customers, products }) // <-- visible in DevTools

        if (!Array.isArray(customers) || !Array.isArray(products)) {
          throw new Error('Bootstrap payload shape invalid')
        }

        setPeople(customers)
        setProducts(products)
        setEntityId(customers[0]?.id ?? '')
        setProductId(products[0]?.id ?? '')
      } catch (e: any) {
        console.error('bootstrap load error:', e)
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const person  = useMemo(() => people.find(p => p.id === entityId), [people, entityId])
  const product = useMemo(() => products.find(p => p.id === productId), [products, productId])
  const price   = product?.unit_price ?? 0
  const lineTotal = +(qty * price).toFixed(2)

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  function save() {
    if (!person || !product) { alert('Data not loaded'); return }
    if (qty <= 0) { alert('Enter a quantity > 0'); return }

    addOrder({
      id: genId(),
      orderNo: nextOrderNo(),
      customerId: person.id,
      customerName: person.name,
      productId: product.id,
      productName: product.name,
      unitPrice: price,
      qty,
      date: orderDate,
      delivered: true,
    })

    alert('Saved (local only for now)!')
    setQtyStr('')
    setEntityId(people[0]?.id ?? '')
    setProductId(products[0]?.id ?? '')
    setOrderDate(new Date().toISOString().slice(0,10))
  }

  // --- Render states ---------------------------------------------------------
  if (loading) return <div className="card"><p>Loading…</p></div>

  if (err) {
    return (
      <div className="card" style={{maxWidth:720}}>
        <h3>New Order</h3>
        <p style={{color:'salmon'}}>Error: {err}</p>
        <p className="helper">Open DevTools → Console to see details (we log the full payload/error).</p>
      </div>
    )
  }

  if (!people.length || !products.length) {
    return (
      <div className="card" style={{maxWidth:720}}>
        <h3>New Order</h3>
        <p>No customers/products found for this tenant.</p>
        <p className="helper">Ensure BLV has rows in <code>customers</code> and <code>products</code>.</p>
      </div>
    )
  }

  // --- Main form -------------------------------------------------------------
  return (
    <div className="card" style={{maxWidth:720}}>
      <h3>New Order</h3>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Customer / Partner</label>
          <select value={entityId} onChange={e => setEntityId(e.target.value)}>
            <optgroup label="Customers">
              {people.filter(p => p.type==='Customer').map(p =>
                <option key={p.id} value={p.id}>{p.name}</option>
              )}
            </optgroup>
            <optgroup label="Partners">
              {people.filter(p => p.type==='Partner').map(p =>
                <option key={p.id} value={p.id}>{p.name}</option>
              )}
            </optgroup>
          </select>
        </div>
        <div>
          <label>Order date</label>
          <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Product</label>
          <select value={productId} onChange={e => setProductId(e.target.value)}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label>Quantity</label>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0"
            value={qtyStr}
            onFocus={(e) => { e.currentTarget.select(); if (qtyStr === '0') setQtyStr('') }}
            onChange={(e) => {
              let v = e.target.value.replace(/\D/g, '')
              v = v.replace(/^0+(?=\d)/, '')
              setQtyStr(v)
            }}
          />
        </div>
      </div>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Unit price (USD)</label>
          <input type="number" value={price} readOnly />
        </div>
        <div>
          <label>Line total</label>
          <input type="text" value={`$${lineTotal.toFixed(2)}`} readOnly />
        </div>
      </div>

      <div style={{marginTop:16, display:'flex', gap:8}}>
        <button className="primary" onClick={save}>Save line</button>
        <button onClick={() => { setQtyStr(''); setProductId(products[0]?.id ?? ''); }}>Clear</button>
      </div>

      <p className="helper" style={{marginTop:12}}>
        Lists loaded from Postgres (BLV). Orders still save locally; POST to DB is next.
      </p>
    </div>
  )
}
