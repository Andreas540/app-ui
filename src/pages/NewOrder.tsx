import { useEffect, useMemo, useState } from 'react'
import { fetchBootstrap, createOrder, type Person, type Product } from '../lib/api'
import { todayYMD } from '../lib/time'

export default function NewOrder() {
  const [people, setPeople] = useState<Person[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [entityId, setEntityId] = useState('')
  const [productId, setProductId] = useState('')
  const [qtyStr, setQtyStr] = useState('')        // integer string
  const [priceStr, setPriceStr] = useState('')    // decimal string
  const [orderDate, setOrderDate] = useState<string>(todayYMD())

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers, products } = await fetchBootstrap()
        setPeople(customers)
        setProducts(products)
        setEntityId(customers[0]?.id ?? '')
        setProductId(products[0]?.id ?? '')
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const person  = useMemo(() => people.find(p => p.id === entityId),   [people, entityId])
  const product = useMemo(() => products.find(p => p.id === productId), [products, productId])

  function parseQty(s: string) {
    const digits = s.replace(/\D/g, '')
    return digits.replace(/^0+(?=\d)/, '')
  }

  async function save() {
    if (!person || !product) { alert('Data not loaded'); return }
    const qtyInt = parseInt(qtyStr || '0', 10)
    if (!Number.isInteger(qtyInt) || qtyInt <= 0) { alert('Enter a quantity > 0'); return }

    const priceNum = Number((priceStr || '').replace(',', '.'))
    if (!Number.isFinite(priceNum) || priceNum <= 0) { alert('Enter a valid unit price > 0'); return }

    try {
      const { order_no } = await createOrder({
        customer_id: person.id,
        product_id: product.id,
        qty: qtyInt,
        unit_price: priceNum,    // per-order-line price
        date: orderDate,
        delivered: true,
        discount: 0,
      })
      alert(`Saved! Order #${order_no}`)
      setQtyStr('')
      setPriceStr('')
      setEntityId(people[0]?.id ?? '')
      setProductId(products[0]?.id ?? '')
      setOrderDate(todayYMD())
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!people.length || !products.length) return <div className="card"><p>No data yet.</p></div>

  const CONTROL_H = 44

  return (
    <div className="card" style={{maxWidth: 720}}>
      <h3>New Order</h3>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Customer / Partner</label>
          <select value={entityId} onChange={e=>setEntityId(e.target.value)} style={{ height: CONTROL_H }}>
            <optgroup label="Customers">
              {people.filter(p=>p.type==='Customer').map(p=>
                <option key={p.id} value={p.id}>{p.name}</option>
              )}
            </optgroup>
            <optgroup label="Partners">
              {people.filter(p=>p.type==='Partner').map(p=>
                <option key={p.id} value={p.id}>{p.name}</option>
              )}
            </optgroup>
          </select>
        </div>

        <div>
          <label>Order date</label>
          <input type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)} style={{ height: CONTROL_H }} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Product</label>
          <select value={productId} onChange={e=>setProductId(e.target.value)} style={{ height: CONTROL_H }}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label>Quantity</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={qtyStr}
            onChange={e => setQtyStr(parseQty(e.target.value))}
            style={{ height: CONTROL_H }}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Unit Price (USD)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={priceStr}
            onChange={e => setPriceStr(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>Save line</button>
        <button onClick={() => { setQtyStr(''); setPriceStr('') }} style={{ height: CONTROL_H }}>Clear</button>
      </div>
    </div>
  )
}
