// src/pages/PartnerDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatUSAny } from '../lib/time'

type PartnerDetail = {
  partner: {
    id: string
    name: string
    phone?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
  }
  totals: {
    total_owed: number
    total_paid: number
    net_owed: number
  }
  orders: Array<{
    id: string
    order_no: number
    order_date: string
    customer_name: string
    partner_amount: number
    total: number
  }>
  payments: Array<{
    id: string
    payment_date: string
    payment_type: string
    amount: number
  }>
}

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PartnerDetail | null>(null)
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
        
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/partner?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
        
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load partner (status ${res.status}) ${text?.slice(0,140)}`)
        }
        
        const d = await res.json()
        setData(d)
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  function fmtIntMoney(n:number) { return `$${Math.round(Number(n)||0).toLocaleString('en-US')}` }
  
  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { partner, totals, orders, payments } = data

  // Show 5 by default
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 5)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 5)

  // Compact layout constants
  const DATE_COL = 55
  const LINE_GAP = 4

  return (
    <div className="card" style={{maxWidth: 960, paddingBottom: 12}}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
          <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {partner.name}
          </h3>
          <Link
            to={`/partners/${partner.id}/edit`}
            className="icon-btn"
            title="Edit partner"
            aria-label="Edit partner"
            style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1, borderRadius: 6 }}
          >
            ✎
          </Link>
        </div>
        <Link to="/partners" className="helper">&larr; Back to partners</Link>
      </div>

      {/* Two columns: LEFT = collapsible info; RIGHT = Owed to partner (right-aligned) */}
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
                <div className="helper">Phone</div>
                <div>{partner.phone ? <a href={phoneHref(partner.phone)}>{partner.phone}</a> : '—'}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">Address</div>
                <div>
                  {[partner.address1, partner.address2].filter(Boolean).join(', ') || '—'}
                  {[partner.address1, partner.address2].filter(Boolean).length > 0 && <br/>}
                  {[partner.city, partner.state, partner.postal_code].filter(Boolean).join(' ')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ textAlign:'right' }}>
          <div className="helper">Owed to partner</div>
          <div style={{ fontWeight: 700 }}>{fmtIntMoney(totals.net_owed)}</div>
        </div>
      </div>

      {/* Recent orders with this partner */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Orders with partner stake</h4>
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
          <div style={{display:'grid', gap:10, marginTop:12}}>
            {shownOrders.map(o => (
              <div
                key={o.id}
                style={{
                  display:'grid',
                  gridTemplateColumns:`${DATE_COL}px 1fr auto auto`,
                  gap:LINE_GAP,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
                }}
              >
                {/* DATE */}
                <div className="helper">{formatUSAny(o.order_date)}</div>

                {/* CUSTOMER NAME */}
                <div className="helper">{o.customer_name}</div>

                {/* PARTNER AMOUNT */}
                <div className="helper" style={{textAlign:'right'}}>
                  {fmtIntMoney(o.partner_amount)}
                </div>

                {/* ORDER TOTAL */}
                <div className="helper" style={{textAlign:'right', paddingLeft:12}}>
                  {fmtIntMoney(o.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payments to partner */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>Payments to partner</h4>
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
          <div style={{display:'grid', gap:10, marginTop:12}}>
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
                {/* DATE */}
                <div className="helper">{formatUSAny(p.payment_date)}</div>

                {/* TYPE */}
                <div className="helper">{p.payment_type}</div>

                {/* AMOUNT */}
                <div className="helper" style={{textAlign:'right'}}>
                  {fmtIntMoney(p.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}