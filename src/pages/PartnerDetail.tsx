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
    product_name?: string | null
    qty?: number | null
    unit_price?: number | null
    total: number
    partner_amount: number
  }>
  payments: Array<{
    id: string
    payment_date: string
    payment_type: string
    amount: number
    notes?: string | null
  }>
}

type Partner = {
  id: string
  name: string
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

  // Transfer state
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferToPartnerId, setTransferToPartnerId] = useState('')
  const [transferNotes, setTransferNotes] = useState('')
  const [allPartners, setAllPartners] = useState<Partner[]>([])
  const [transferring, setTransferring] = useState(false)

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

  // Load all partners for the dropdown
  useEffect(() => {
    (async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/partners`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load partners')
        const data = await res.json()
        // The API returns { partners: [...] }
        const partnersList = data.partners || []
        // Filter out the current partner from the dropdown
        setAllPartners(partnersList.filter((p: Partner) => p.id !== id))
      } catch (e) {
        console.error('Failed to load partners:', e)
      }
    })()
  }, [id])

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

  function fmtIntMoney(n:number) {
    return `$${Math.round(Number(n)||0).toLocaleString('en-US')}`
  }
  function fmtMoney(n:number) {
    return `$${(Number(n)||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  // Get current date in EST timezone, format as YYYY-MM-DD
  function getCurrentDateEST(): string {
    const now = new Date()
    // Convert to EST (UTC-5 or UTC-4 depending on DST)
    const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const year = estDate.getFullYear()
    const month = String(estDate.getMonth() + 1).padStart(2, '0')
    const day = String(estDate.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleOrderClick = (order: any) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  const handlePaymentClick = (payment: any) => {
    setSelectedPayment(payment)
    setShowPaymentModal(true)
  }

  const handleTransferSubmit = async () => {
    // Validation
    const amount = parseFloat(transferAmount.replace(/,/g, ''))
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    if (!transferToPartnerId) {
      alert('Please select a partner to transfer to')
      return
    }

    setTransferring(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const paymentDate = getCurrentDateEST()
      
      // Generate a unique ID for both payments (UUID-like)
      const transferId = crypto.randomUUID()

      // Create array of 2 payments
      const payments = [
        {
          id: transferId,
          partner_id: id, // Current partner (FROM)
          payment_date: paymentDate,
          payment_type: 'Partner transfer',
          amount: amount, // Positive (they gave money away)
          notes: transferNotes.trim() || null
        },
        {
          id: transferId,
          partner_id: transferToPartnerId, // Selected partner (TO)
          payment_date: paymentDate,
          payment_type: 'Partner transfer',
          amount: -amount, // Negative (they received money)
          notes: transferNotes.trim() || null
        }
      ]

      // Submit both payments
      const res = await fetch(`${base}/api/partner-transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payments })
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to create transfer (status ${res.status}) ${text?.slice(0,140)}`)
      }

      // Show confirmation
      const toPartnerName = allPartners.find(p => p.id === transferToPartnerId)?.name || 'partner'
      alert(`Transfer of ${fmtMoney(amount)} to ${toPartnerName} completed successfully!`)

      // Reset form and hide
      setTransferAmount('')
      setTransferToPartnerId('')
      setTransferNotes('')
      setShowTransferForm(false)

      // Reload partner data to show new payment
      const reloadRes = await fetch(`${base}/api/partner?id=${encodeURIComponent(id!)}`, { cache: 'no-store' })
      if (reloadRes.ok) {
        const d = await reloadRes.json()
        setData(d)
      }
    } catch (e: any) {
      console.error('Transfer failed:', e)
      alert(`Transfer failed: ${e.message}`)
    } finally {
      setTransferring(false)
    }
  }

  // Format amount input with thousand separator and decimals
  const handleAmountChange = (value: string) => {
    // Remove all non-digits and non-decimal points
    const cleaned = value.replace(/[^\d.]/g, '')
    
    // Allow only one decimal point
    const parts = cleaned.split('.')
    if (parts.length > 2) return
    
    // Format the integer part with thousand separators
    const integerPart = parts[0] ? parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
    
    // Keep max 2 decimal places
    const decimalPart = parts.length > 1 ? parts[1].substring(0, 2) : ''
    
    // Construct the formatted value
    if (parts.length > 1) {
      // User has typed a decimal point
      setTransferAmount(`${integerPart}.${decimalPart}`)
    } else {
      // No decimal point yet
      setTransferAmount(integerPart)
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { partner, totals, orders, payments } = data

  // Show 5 by default
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 5)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 5)

  // Compact layout constants (match CustomerDetail)
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

      {/* New Transfer button */}
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <button
          className="primary"
          onClick={() => setShowTransferForm(v => !v)}
          style={{
            width: 100,
            height: 28,
            fontSize: 12,
            padding: '0 10px',
            borderRadius: 6,
            whiteSpace: 'nowrap'
          }}
        >
          New transfer
        </button>
      </div>

      {/* Transfer Form (collapsible) */}
      {showTransferForm && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)' }}>
          {/* First row: Amount and To Partner */}
          <div className="row row-2col-mobile" style={{ marginBottom: 12 }}>
            <div>
              <label>Amount (USD)</label>
              <input
                type="text"
                value={transferAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label>To Partner</label>
              <select
                value={transferToPartnerId}
                onChange={(e) => setTransferToPartnerId(e.target.value)}
              >
                <option value="">Select partner...</option>
                {allPartners.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Second row: Notes and Make transfer button */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Notes</label>
              <input
                type="text"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
            <button
              className="primary"
              onClick={handleTransferSubmit}
              disabled={transferring}
              style={{
                height: 'var(--control-h)',
                padding: '0 16px',
                whiteSpace: 'nowrap'
              }}
            >
              {transferring ? 'Processing...' : 'Make transfer'}
            </button>
          </div>
        </div>
      )}

      {/* Partner Info + Owed to partner (right) */}
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

        {/* RIGHT (printable): Owed to partner */}
        <div
          data-printable
          data-printable-id="owed"
          data-printable-title="Owed to Partner"
          style={{ textAlign:'right' }}
        >
          <div className="helper">Owed to partner</div>
          <div style={{ fontWeight: 700 }}>{fmtIntMoney(totals.net_owed)}</div>
        </div>
      </div>

      {/* === Orders (CustomerDetail-like layout) === */}
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
          <div style={{display:'grid', gap:10, marginTop:12}} data-print-rows>
            {shownOrders.map(o => {
              const middleLine2 = [
                o.product_name || '—',
                (o.qty ?? '—'),
                (o.unit_price != null ? fmtMoney(o.unit_price) : '—'),
                fmtMoney(o.total)
              ].join(' / ')

              return (
                <div
                  key={o.id}
                  data-print-row
                  style={{
                    display:'grid',
                    gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                    gap:LINE_GAP,
                    borderBottom:'1px solid #eee',
                    padding:'8px 0'
                  }}
                >
                  {/* DATE */}
                  <div className="helper" data-date={o.order_date}>
                    {formatUSAny(o.order_date)}
                  </div>

                  {/* spacer */}
                  <div style={{ width: 20 }}></div>

                  {/* MIDDLE */}
                  <div 
                    className="helper"
                    onClick={() => handleOrderClick(o)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{ cursor: 'pointer' }}
                  >
                    <div><strong data-customer={o.customer_name}>{o.customer_name}</strong></div>
                    <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>
                      {middleLine2}
                    </div>
                  </div>

                  {/* RIGHT: Partner amount */}
                  <div 
                    className="helper" 
                    onClick={() => handleOrderClick(o)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{textAlign:'right', cursor: 'pointer'}}
                    title="Partner amount"
                  >
                    {fmtMoney(o.partner_amount)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* === Payments === */}
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
            {shownPayments.map(p => {
              const notes = (p.notes ?? '').trim()
              const isOther = (p.payment_type || '').toLowerCase() === 'other'
              const isAddToDebt = (p.payment_type || '').toLowerCase() === 'add to debt'
              const mainLine = isOther ? (notes || 'Other') : p.payment_type

              // Amount display: "-$..." for all, except "+$..." (no minus) for Add to debt
              const amountStr = isAddToDebt
                ? fmtMoney(Math.abs(p.amount))
                : `-${fmtMoney(Math.abs(p.amount))}`

              return (
                <div
                  key={p.id}
                  data-print-row
                  style={{
                    display:'grid',
                    gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                    gap:LINE_GAP,
                    borderBottom:'1px solid #eee',
                    padding:'8px 0'
                  }}
                >
                  {/* DATE */}
                  <div className="helper" data-date={p.payment_date}>
                    {formatUSAny(p.payment_date)}
                  </div>

                  {/* spacer */}
                  <div style={{ width: 20 }}></div>

                  {/* TYPE (+ optional notes line) */}
                  <div 
                    className="helper"
                    onClick={() => handlePaymentClick(p)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>{mainLine}</div>
                    {!isOther && notes && (
                      <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>
                        {notes}
                      </div>
                    )}
                  </div>

                  {/* AMOUNT: "-$..." except Add to debt */}
                  <div 
                    className="helper" 
                    onClick={() => handlePaymentClick(p)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{textAlign:'right', cursor: 'pointer'}}
                    title={isAddToDebt ? 'Added to debt' : 'Payment to partner'}
                  >
                    {amountStr}
                  </div>
                </div>
              )
            })}
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





