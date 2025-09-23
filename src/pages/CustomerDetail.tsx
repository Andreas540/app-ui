// src/pages/CustomerDetail.tsx
import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCustomerDetail, type CustomerDetail } from '../lib/api'
import { formatUSAny } from '../lib/time'  // shared US formatter (MM/DD/YY), TZ-safe

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

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data
  const addrLine1 = [customer.address1, customer.address2].filter(Boolean).join(', ')
  const addrLine2 = [customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ')

  // ✅ Use ONLY customer.customer_type now
  const isPartnerCustomer = useMemo(
    () => (customer as any).customer_type === 'Partner',
    [customer]
  )

  // Show 5 by default
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 5)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 5)

  // Narrower date column; tiny gap to pull middle text left
  const DATE_COL = 78 // px
  const LINE_GAP = 4  // px

  return (
    <div className="card" style={{maxWidth: 960, paddingBottom: 12}}>
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

              <div style={{ marginTop: 10 }}>
                <div className="helper">Type</div>
                <div>{(customer as any).customer_type ?? '—'}</div> {/* ✅ no fallback to .type */}
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
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Recent orders</h4>
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
          <div style={{display:'grid', gap:10}}>
            {shownOrders.map(o => {
              const product = (o as any).product_name
              const qty = (o as any).qty
              const unitPrice = (o as any).unit_price
              const partnerAmt = (o as any).partner_amount
              const middleText =
                product != null && qty != null && unitPrice != null
                  ? `${product}  /  ${qty}  /  $${Number(unitPrice).toFixed(2)}${
                      isPartnerCustomer && Number(partnerAmt) > 0 ? `  /  $${Number(partnerAmt).toFixed(2)}` : ''
                    }`
                  : `${o.lines} line(s)`
              return (
                <div
                  key={o.id}
                  style={{
                    display:'grid',
                    gridTemplateColumns:`${DATE_COL}px 1fr auto`,
                    gap:LINE_GAP,
                    borderBottom:'1px solid #eee',
                    padding:'8px 0'
                  }}
                >
                  <div className="helper">{formatUSAny((o as any).order_date)}</div>
                  <div className="helper">{middleText}</div>
                  <div className="helper" style={{textAlign:'right'}}>{fmtIntMoney((o as any).total)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Recent payments</h4>
          {payments.length > 5 && (
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
          <div style={{display:'grid', gap:10}}>
            {shownPayments.map(p => (
              <div
                key={p.id}
                style={{
                  display:'grid',
                  gridTemplateColumns:`${DATE_COL}px 1fr auto`,
                  gap:LINE_GAP,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
                }}
              >
                <div className="helper">{formatUSAny((p as any).payment_date)}</div>
                <div className="helper">{(p as any).payment_type}</div>
                <div className="helper" style={{textAlign:'right'}}>{fmtIntMoney((p as any).amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

