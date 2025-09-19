// src/pages/CustomerDetail.tsx
import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCustomerDetail, type CustomerDetail } from '../lib/api'
import { fmtUSDate } from '../lib/time'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllPayments, setShowAllPayments] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setErr('Missing id'); setLoading(false); return }
        setLoading(true); setErr(null)
        const d = await fetchCustomerDetail(id)
        setData(d)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // Helpers
  function fmtMoney(n:number) { return `$${(Number(n) || 0).toFixed(2)}` }             // shipping cost
  function fmtIntMoney(n:number) { return `$${Math.round(Number(n)||0).toLocaleString('en-US')}` }
  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  const recentOrders = useMemo(() => {
    if (!data) return []
    return showAllOrders ? data.orders : data.orders.slice(0, 4)
  }, [data, showAllOrders])

  const recentPayments = useMemo(() => {
    if (!data) return []
    return showAllPayments ? data.payments : data.payments.slice(0, 4)
  }, [data, showAllPayments])

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data
  const addrLine1 = [customer.address1, customer.address2].filter(Boolean).join(', ')
  const addrLine2 = [customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ')

  return (
    <div className="card" style={{maxWidth: 960}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
          <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {customer.name}
          </h3>
          <Link
            to={`/customers/${customer.id}/edit`}
            className="icon-btn"
            title="Edit customer"
            aria-label="Edit customer"
            style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1, borderRadius: 6 }}
          >
            ✎
          </Link>
        </div>
        <Link to="/customers" className="helper">&larr; Back to customers</Link>
      </div>

      {/* Two columns on ALL screens for the top info block */}
      <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
        {/* LEFT column: Type + Phone + Address */}
        <div>
          <div className="helper">Type</div>
          <div>{customer.customer_type ?? customer.type}</div>

          <div style={{ marginTop: 12 }}>
            <div className="helper">Phone</div>
            <div>
              {customer.phone
                ? <a href={phoneHref(customer.phone)}>{customer.phone}</a>
                : '—'}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="helper">Address</div>
            <div>
              {addrLine1 || '—'}{addrLine1 && <br/>}{addrLine2}
            </div>
          </div>
        </div>

        {/* RIGHT column: Shipping + Owed to me (only the balance amount) */}
        <div>
          <div className="helper">Shipping cost</div>
          <div>{fmtMoney(customer.shipping_cost ?? 0)}</div>

          <div style={{ marginTop: 12 }}>
            <div className="helper">Owed to me</div>
            <div style={{ fontWeight: 700 }}>{fmtIntMoney(totals.owed_to_me)}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
        <h4 style={{ margin:0 }}>Recent orders</h4>
        {orders.length > 4 && (
          <button
            onClick={() => setShowAllOrders(v => !v)}
            className="linklike"
            style={{ background:'none', border:'none', padding:0, color:'inherit', cursor:'pointer' }}
          >
            {showAllOrders ? 'Show less' : 'Show all orders'}
          </button>
        )}
      </div>
      {orders.length === 0 ? <p className="helper">No orders yet.</p> : (
        <div style={{display:'grid', gap:8}}>
          {recentOrders.map(o => (
            <div
              key={o.id}
              style={{
                display:'grid',
                gridTemplateColumns:'110px 1fr auto',
                gap:8,
                borderBottom:'1px solid #eee',
                padding:'8px 0'
              }}
            >
              <div className="helper">{fmtUSDate(o.order_date)}</div>
              <div>{o.product_name}  /  {o.qty}</div>
              <div style={{textAlign:'right'}}>{fmtIntMoney(o.total)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
        <h4 style={{ margin:0 }}>Recent payments</h4>
        {payments.length > 4 && (
          <button
            onClick={() => setShowAllPayments(v => !v)}
            className="linklike"
            style={{ background:'none', border:'none', padding:0, color:'inherit', cursor:'pointer' }}
          >
            {showAllPayments ? 'Show less' : 'Show all payments'}
          </button>
        )}
      </div>
      {payments.length === 0 ? <p className="helper">No payments yet.</p> : (
        <div style={{display:'grid', gap:8}}>
          {recentPayments.map(p => (
            <div
              key={p.id}
              style={{
                display:'grid',
                gridTemplateColumns:'110px 1fr auto',
                gap:8,
                borderBottom:'1px solid #eee',
                padding:'8px 0'
              }}
            >
              <div className="helper">{fmtUSDate(p.payment_date)}</div>
              <div>{p.payment_type}</div>
              <div style={{textAlign:'right'}}>{fmtIntMoney(p.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}









