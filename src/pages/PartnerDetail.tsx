// src/pages/PartnerDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatUSAny } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'
import PaymentDetailModal from '../components/PaymentDetailModal'
import PrintDialog from '../components/PrintDialog'
import { PrintManager } from '../lib/printManager'
import type { PrintOptions } from '../lib/printManager'

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
    // NEW fields from backend:
    product_name?: string | null
    qty?: number | null
    unit_price?: number | null
    // amounts:
    total: number              // order total (amount)
    partner_amount: number     // this partner's amount on the order
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
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  
  // Print dialog state
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null)

  // Register print dialog handler
  useEffect(() => {
    PrintManager.setDialogHandler((options) => {
      setPrintOptions(options)
      setShowPrintDialog(true)
    })
  }, [])

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
  function fmtMoney(n:number) { return `$${(Number(n)||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
  
  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  const handleOrderClick = (order: any) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  const handlePaymentClick = (payment: any) => {
    setSelectedPayment(payment)
    setShowPaymentModal(true)
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
  const NUM_COL  = 72
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => PrintManager.openPrintDialog()}
            className="icon-btn"
            title="Print to PDF"
            aria-label="Print to PDF"
            style={{ width: 20, height: 20, fontSize: 14, lineHeight: 1, borderRadius: 6 }}
          >
            🖨️
          </button>
          <Link to="/partners" className="helper">&larr; Back to partners</Link>
        </div>
      </div>

      {/* Partner Info - NOT printable (kept on screen only) */}
      <div 
        className="row row-2col-mobile" 
        style={{ marginTop: 12 }}
      >
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

        {/* RIGHT (screen view) */}
        <div style={{ textAlign:'right' }}>
          <div className="helper">Owed to partner</div>
          <div style={{ fontWeight: 700 }}>{fmtIntMoney(totals.net_owed)}</div>
        </div>
      </div>

      {/* === PRINTABLE BLOCK 1: Owed to Partner === */}
      <section
        data-printable
        data-printable-id="owed"
        data-printable-title="Owed to Partner"
        style={{ marginTop: 12 }}
      >
        <h4 style={{ margin: 0 }}>Owed to Partner</h4>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span className="helper">Partner</span>
          <strong>{partner.name}</strong>
        </div>
        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span className="helper">Net owed</span>
          <strong>{fmtIntMoney(totals.net_owed)}</strong>
        </div>
      </section>

      {/* === PRINTABLE BLOCK 2: Orders (updated columns) === */}
      <section 
        data-printable
        data-printable-id="orders"
        data-printable-title="Orders with Partner Stake"
        style={{ marginTop: 20 }}
      >
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
          // Container that holds the rows to sort/filter
          <div style={{display:'grid', gap:10, marginTop:12}} data-print-rows>
            {shownOrders.map(o => (
              <div
                key={o.id}
                data-print-row
                style={{
                  display:'grid',
                  gridTemplateColumns: `${DATE_COL}px 1fr 1.2fr ${NUM_COL}px ${NUM_COL}px ${NUM_COL}px ${NUM_COL}px`,
                  gap: LINE_GAP,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
                }}
              >
                {/* Date */}
                <div 
                  className="helper"
                  data-date={o.order_date}
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ cursor: 'pointer' }}
                >
                  {formatUSAny(o.order_date)}
                </div>

                {/* Customer */}
                <div 
                  className="helper"
                  data-customer={o.customer_name}
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ cursor: 'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                >
                  {o.customer_name}
                </div>

                {/* Product (first line) */}
                <div 
                  className="helper"
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ cursor: 'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                  title={o.product_name || undefined}
                >
                  {o.product_name || '—'}
                </div>

                {/* Qty */}
                <div 
                  className="helper"
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ textAlign:'right', cursor: 'pointer' }}
                >
                  {o.qty ?? '—'}
                </div>

                {/* Unit price */}
                <div 
                  className="helper"
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ textAlign:'right', cursor: 'pointer' }}
                >
                  {o.unit_price != null ? fmtMoney(o.unit_price) : '—'}
                </div>

                {/* Amount (order total) — moved next to unit price */}
                <div 
                  className="helper" 
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{textAlign:'right', cursor: 'pointer'}}
                >
                  {fmtMoney(o.total)}
                </div>

                {/* Partner amount — moved to far right */}
                <div 
                  className="helper" 
                  onClick={() => handleOrderClick(o)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{textAlign:'right', paddingLeft:12, cursor: 'pointer'}}
                >
                  {fmtMoney(o.partner_amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* === PRINTABLE BLOCK 3: Payments === */}
      <section 
        data-printable
        data-printable-id="payments"
        data-printable-title="Payments to Partner"
        style={{ marginTop: 20 }}
      >
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
          <div style={{display:'grid', gap:10, marginTop:12}} data-print-rows>
            {shownPayments.map(p => (
              <div
                key={p.id}
                data-print-row
                style={{
                  display:'grid',
                  gridTemplateColumns:`${DATE_COL}px 1fr ${NUM_COL}px`,
                  gap:LINE_GAP,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
                }}
              >
                <div 
                  className="helper"
                  data-date={p.payment_date}
                  onClick={() => handlePaymentClick(p)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ cursor: 'pointer' }}
                >
                  {formatUSAny(p.payment_date)}
                </div>

                <div 
                  className="helper"
                  onClick={() => handlePaymentClick(p)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{ cursor: 'pointer' }}
                >
                  {p.payment_type}
                </div>

                <div 
                  className="helper" 
                  onClick={() => handlePaymentClick(p)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{textAlign:'right', cursor: 'pointer'}}
                >
                  {fmtMoney(p.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <OrderDetailModal 
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
      />

      <PaymentDetailModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        payment={selectedPayment}
        isPartnerPayment={true}
      />

      <PrintDialog
        isOpen={showPrintDialog}
        onClose={() => setShowPrintDialog(false)}
        options={printOptions}
      />
    </div>
  )
}

