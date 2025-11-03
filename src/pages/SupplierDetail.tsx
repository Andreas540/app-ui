// src/pages/SupplierDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatUSAny } from '../lib/time'

interface Supplier {
  id: string
  name: string
  phone?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postal_code?: string
}

interface OrderItem {
  order_id: string
  product_name: string
  qty: number
  product_cost: number
  shipping_cost: number
  product_total: number
  shipping_total: number
}

interface Order {
  id: string
  order_no: string
  order_date: string
  notes?: string
  total: number
  lines: number
  items: OrderItem[]
}

interface Totals {
  total_orders: number
  total_payments: number
  owed_to_supplier: number
}

interface SupplierDetail {
  supplier: Supplier
  totals: Totals
  orders: Order[]
  payments: any[]
}

async function fetchSupplierDetail(id: string): Promise<SupplierDetail> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/supplier?id=${id}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch supplier (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return res.json()
}

export default function SupplierDetailPage() {
  // --- Hooks (fixed, stable order) ---
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<SupplierDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setErr('Missing id'); setLoading(false); return }
        setLoading(true); setErr(null)
        const d = await fetchSupplierDetail(id)
        setData(d)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // --- Helpers (no hooks here) ---
  function fmtMoney(n: number) {
    const v = Number(n) || 0
    const sign = v < 0 ? '-' : ''
    const abs = Math.abs(v)
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  function fmtIntMoney(n: number) {
    const v = Number(n) || 0
    const sign = v < 0 ? '-' : ''
    const abs = Math.abs(v)
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
  }
  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { supplier, totals, orders } = data
  const addrLine1 = [supplier.address1, supplier.address2].filter(Boolean).join(', ')
  const addrLine2 = [supplier.city, supplier.state, supplier.postal_code].filter(Boolean).join(' ')

  // Show 5 by default
  const shownOrders = showAllOrders ? orders : orders.slice(0, 5)

  // Compact layout constants
  const DATE_COL = 55 // px (smaller; pulls middle text left)
  const LINE_GAP = 4  // tighter than default

  return (
    <div className="card" style={{maxWidth: 960, paddingBottom: 12}}>
      {/* Header row: Name + Edit (left), Back link (right) */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
          <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {supplier.name}
          </h3>
          <Link
            to={`/suppliers/${supplier.id}/edit`}
            className="icon-btn"
            title="Edit supplier"
            aria-label="Edit supplier"
            style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1, borderRadius: 6 }}
          >
            ✎
          </Link>
        </div>

        <Link to="/suppliers" className="helper" style={{ whiteSpace:'nowrap' }}>
          &larr; Suppliers
        </Link>
      </div>

      {/* Action row under name: New order + New payment */}
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <Link
          to={`/supplier-orders/new?supplier_id=${supplier.id}&supplier_name=${encodeURIComponent(supplier.name)}&return_to=supplier&return_id=${supplier.id}`}
          style={{ textDecoration: 'none' }}
        >
          <button
            className="primary"
            style={{
              width: 100,
              height: 28,
              fontSize: 12,
              padding: '0 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap'
            }}
          >
            New order
          </button>
        </Link>

        <button
          className="primary"
          disabled
          style={{
            width: 100,
            height: 28,
            fontSize: 12,
            padding: '0 10px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            opacity: 0.5,
            cursor: 'not-allowed'
          }}
        >
          New payment
        </button>
      </div>

      {/* Two columns: LEFT = collapsible info; RIGHT = Owed to supplier (right-aligned) */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        {/* LEFT */}
        <div>
          {!showInfo ? (
            <button
              className="helper"
              onClick={() => setShowInfo(true)}
              style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
            >
              Show info
            </button>
          ) : (
            <div>
              <button
                className="helper"
                onClick={() => setShowInfo(false)}
                style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
              >
                Hide info
              </button>

              <div style={{ marginTop: 12 }}>
                <div className="helper">Phone</div>
                <div>{supplier.phone ? <a href={phoneHref(supplier.phone)}>{supplier.phone}</a> : '—'}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">Address</div>
                <div>
                  {addrLine1 || '—'}{addrLine1 && <br/>}{addrLine2}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ textAlign:'right' }}>
          <div className="helper">Owed to supplier</div>
          <div style={{ fontWeight: 700 }}>{fmtIntMoney(totals.owed_to_supplier)}</div>
        </div>
      </div>

      {/* Orders with supplier */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Orders with supplier</h4>
          {orders.length > 5 && (
            <button
              className="helper"
              onClick={() => setShowAllOrders(v => !v)}
              style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
            >
              {showAllOrders ? 'Show less' : 'Show all orders'}
            </button>
          )}
        </div>

        {orders.length === 0 ? <p className="helper">No orders yet.</p> : (
          <div style={{display:'grid'}}>
            {shownOrders.map(o => {
              const hasNotes = o.notes && o.notes.trim()
              const totalShippingCost = o.items.reduce((sum, item) => sum + Number(item.shipping_total || 0), 0)

              return (
                <div
                  key={o.id}
                  style={{
                    borderBottom:'1px solid #eee',
                    paddingTop: '12px',
                    paddingBottom: '12px'
                  }}
                >
                  {/* First row: Date + Order number + Total */}
                  <div
                    style={{
                      display:'grid',
                      gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                      gap:LINE_GAP,
                    }}
                  >
                    {/* DATE (MM/DD/YY) */}
                    <div className="helper">{formatUSAny(o.order_date)}</div>

                    {/* EMPTY COLUMN for alignment */}
                    <div></div>

                    {/* ORDER NUMBER */}
                    <div className="helper" style={{ lineHeight: '1.4' }}>
                      {o.order_no}
                    </div>

                    {/* TOTAL COST */}
                    <div className="helper" style={{textAlign:'right'}}>
                      {fmtMoney(o.total)}
                    </div>
                  </div>

                  {/* Product rows */}
                  {o.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display:'grid',
                        gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                        gap:LINE_GAP,
                        marginTop: 4
                      }}
                    >
                      <div></div>
                      <div></div>
                      <div className="helper" style={{ lineHeight: '1.4' }}>
                        {item.product_name} / {Number(item.qty).toLocaleString('en-US')} / {fmtMoney(item.product_cost)}
                      </div>
                      <div className="helper" style={{textAlign:'right'}}>
                        {fmtMoney(item.product_total)}
                      </div>
                    </div>
                  ))}

                  {/* Shipping cost row */}
                  {totalShippingCost > 0 && (
                    <div
                      style={{
                        display:'grid',
                        gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                        gap:LINE_GAP,
                        marginTop: 4
                      }}
                    >
                      <div></div>
                      <div></div>
                      <div className="helper" style={{ lineHeight: '1.4' }}>
                        Shipping cost
                      </div>
                      <div className="helper" style={{textAlign:'right'}}>
                        {fmtMoney(totalShippingCost)}
                      </div>
                    </div>
                  )}

                  {/* NOTES ROW */}
                  {hasNotes && (
                    <div
                      style={{
                        display:'grid',
                        gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                        gap:LINE_GAP,
                        marginTop: 4
                      }}
                    >
                      <div></div>
                      <div></div>
                      <div className="helper" style={{ lineHeight: '1.4' }}>
                        {o.notes}
                      </div>
                      <div></div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Payments to supplier (placeholder) */}
      <div style={{ marginTop: 20 }}>
        <h4 style={{margin:0}}>Payments to supplier</h4>
        <p className="helper">No payments yet.</p>
      </div>
    </div>
  )
}