// src/pages/CustomerDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCustomerDetail, type CustomerDetail } from '../lib/api'

export default function CustomerDetailPage() {
  // Hooks
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setErr('Missing id'); setLoading(false); return }
        setLoading(true); setErr(null)
        const d = await fetchCustomerDetail(id)
        setData(d)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  // Helpers
  function fmtMoney(n:number) { return `$${(Number(n) || 0).toFixed(2)}` }
  function fmtIntMoney(n:number) { return `$${Math.round(Number(n)||0).toLocaleString('en-US')}` }
  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }
  function fmtUS(d: string | Date | undefined) {
    if (!d) return ''
    const dt = typeof d === 'string' ? new Date(d) : d
    if (Number.isNaN(dt.getTime())) return String(d)
    return dt.toLocaleDateString('en-US')
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data
  const addrLine1 = [customer.address1, customer.address2].filter(Boolean).join(', ')
  const addrLine2 = [customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ')
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 4)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 4)

  // Fixed width for the date column so middle column stays aligned
  const DATE_COL = 100 // px

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

      {/* Two columns: LEFT = collapsible info; RIGHT = Owed to me (right-aligned) */}
      <div className="row row-2col-mobile" style={{ marginTop: 8 }}>
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

              <div style={{ marginTop: 8 }}>
                <div className="helper">Type</div>
                <div>{(customer as any).customer_type ?? customer.type}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">Shipping cost</div>
                <div>{fmtMoney((customer as any).shipping_cost ?? 0)}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">Phone</div>
                <div>{customer.phone ? <a href={phoneHref(customer.phone)}>{customer.phone}</a> : '—'}</div>
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
          <div className="helper">Owed to me</div>
          <div style={{ fontWeight: 700 }}>{fmtIntMoney((totals as any).owed_to_me)}</div>
        </div>
      </div>

      {/* Recent orders */}
      <div style={{ marginTop: 16 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Recent orders</h4>
          {orders.length > 4 && (
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
          <div style={{display:'grid', gap:8}}>
            {shownOrders.map(o => (
              <div
                key={o.id}
                style={{
                  display:'grid',
                  gridTemplateColumns:`${DATE_COL}px 1fr auto`,
                  gap:8,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
                }}
              >
                <div className="helper">{fmtUS((o as any).order_date)}</div>
                <div>{ (o as any).product_name && (o as any).qty != null
                        ? `${(o as any).product_name}  /  ${(o as any).qty}`
                        : `${o.lines} line(s)` }</div>
                <div style={{textAlign:'right'}}>{fmtIntMoney((o as any).total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div style={{ marginTop: 16 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Recent payments</h4>
          {payments.length > 4 && (
            <button
              className="helper"
              onClick={() => setShowAllPayments(v => !v)}
              style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
            >
              {showAllPayments ? 'Show less' : 'Show all payments'}
            </button>
          )}
        </div>

        {payments.length === 0 ? <p className="helper">No payments yet.</p> : (
          <div style={{display:'grid', gap:8}}>
            {shownPayments.map(p => (
              <div
                key={p.id}
                style={{
                  display:'grid',
                  gridTemplateColumns:`${DATE_COL}px 1fr auto`,
                  gap:8,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
                }}
              >
                <div className="helper">{fmtUS((p as any).payment_date)}</div>
                <div>{(p as any).payment_type}</div>
                <div style={{textAlign:'right'}}>{fmtIntMoney((p as any).amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
















