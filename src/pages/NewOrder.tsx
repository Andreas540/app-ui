import { useState } from 'react'
import { addOrder, nextOrderNo } from '../lib/storage'

const CUSTOMERS = [
  { id: 'roger', name: 'Roger DC' },
  { id: 'acme', name: 'Acme Corp' },
]

const PRODUCTS = [
  { id: 'ace', name: 'ACE Ultra', price: 5.25 },
  { id: 'favorites', name: 'Favorites', price: 5.25 },
  { id: 'boutiq', name: 'Boutiq', price: 5.25 },
  { id: 'popz', name: 'Popz', price: 5.25 },
  { id: 'hitz', name: 'Hitz', price: 4.60 },
]

export default function NewOrder() {
  const [customerId, setCustomerId] = useState(CUSTOMERS[0].id)
  const [productId, setProductId] = useState(PRODUCTS[0].id)

  // Keep quantity as a string so first keypress replaces any 0 and we can strip leading zeros.
  const [qtyStr, setQtyStr] = useState('')         // shows empty, not "0"
  const qty = qtyStr === '' ? 0 : Math.max(0, parseInt(qtyStr, 10) || 0)

  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0,10)) // YYYY-MM-DD

  const customer = CUSTOMERS.find(c => c.id === customerId)!
  const product  = PRODUCTS.find(p => p.id === productId)!
  const price = product.price
  const lineTotal = +(qty * price).toFixed(2)

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  function save() {
    if (qty <= 0) { alert('Enter a quantity > 0'); return }

    addOrder({
      id: genId(),
      orderNo: nextOrderNo(),
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productName: product.name,
      unitPrice: price,
      qty,
      date: orderDate,
      delivered: true,
    })

    alert('Saved!')
    setQtyStr('')
    setProductId(PRODUCTS[0].id)
    setCustomerId(CUSTOMERS[0].id)
    setOrderDate(new Date().toISOString().slice(0,10))
  }

  return (
    <div className="card" style={{maxWidth:720}}>
      <h3>New Order</h3>

      {/* Row 1: Customer + Date */}
      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Customer</label>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
            {CUSTOMERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>Order date</label>
          <input
            type="date"
            value={orderDate}
            onChange={e => setOrderDate(e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: Product + Quantity */}
      <div className="row" style={{marginTop:12}}>
        <div>
          <label>Product</label>
          <select value={productId} onChange={e => setProductId(e.target.value)}>
            {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label>Quantity</label>
<input
  type="text"                 // full control over what shows
  inputMode="numeric"
  pattern="[0-9]*"
  placeholder="0"
  value={qtyStr}              // <-- qtyStr is a string state
  onFocus={(e) => {
    e.currentTarget.select(); // first key replaces everything
    if (qtyStr === '0') setQtyStr('');
  }}
  onChange={(e) => {
    // digits only
    let v = e.target.value.replace(/\D/g, '');
    // strip leading zeros (keep empty if user cleared)
    v = v.replace(/^0+(?=\d)/, '');
    setQtyStr(v);
  }}
/>
        </div>
      </div>

      {/* Row 3: Price + Line total */}
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
        <button onClick={() => { setQtyStr(''); setProductId(PRODUCTS[0].id); }}>Clear</button>
      </div>

      <p className="helper" style={{marginTop:12}}>
        No backend yet—saves to this device (localStorage).
      </p>
    </div>
  )
}

