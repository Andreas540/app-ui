// src/pages/PartnerDetail.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { formatDate, todayYMD } from '../lib/time'
import { useLocale } from '../contexts/LocaleContext'
import OrderDetailModal from '../components/OrderDetailModal'
import PaymentDetailModal from '../components/PaymentDetailModal'
import PrintDialog from '../components/PrintDialog'
import { PrintManager } from '../lib/printManager'
import type { PrintOptions } from '../lib/printManager'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import { useCurrency } from '../lib/useCurrency'

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
    debtors?: Array<{
      partner_id: string
      partner_name: string
      net_owed: number
    }>
    creditors?: Array<{
      partner_id: string
      partner_name: string
      net_owed: number
    }>
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
    order_no?: number | null
  }>
}

type Partner = {
  id: string
  name: string
}

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const { timezone } = useLocale()
  const { user } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  const showPartnerTransfer = config.payments.showPartnerTransfer
  const showOrderNumber = config.ui.showOrderNumberInList
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

  // Debt payment state
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentToPartnerId, setPaymentToPartnerId] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paying, setPaying] = useState(false)

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
const res = await fetch(`${base}/api/partners`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})
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
const res = await fetch(`${base}/api/partner?id=${encodeURIComponent(id)}`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})

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

  const { fmtMoney, fmtIntMoney, parseAmount } = useCurrency()

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

  const handleTransferSubmit = async () => {
    // Validation
    const amount = parseAmount(transferAmount)
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
      const paymentDate = todayYMD(timezone)
      
      // Get partner names
      const fromPartnerName = data?.partner.name || 'Unknown'
      const toPartner = allPartners.find(p => p.id === transferToPartnerId)
      const toPartnerName = toPartner?.name || 'Unknown'

      // Create notes with transfer info and user notes
      const fromNotes = transferNotes.trim() 
        ? `Transfer to ${toPartnerName} | ${transferNotes.trim()}`
        : `Transfer to ${toPartnerName}`
      
      const toNotes = transferNotes.trim()
        ? `Transfer from ${fromPartnerName} | ${transferNotes.trim()}`
        : `Transfer from ${fromPartnerName}`

      // Create array of 2 payments with DIFFERENT IDs
      const payments = [
        {
          id: crypto.randomUUID(), // Unique ID for first payment
          partner_id: id, // Current partner (FROM)
          payment_date: paymentDate,
          payment_type: 'Partner transfer',
          amount: amount, // Positive (they gave money away)
          notes: fromNotes
        },
        {
          id: crypto.randomUUID(), // Unique ID for second payment
          partner_id: transferToPartnerId, // Selected partner (TO)
          payment_date: paymentDate,
          payment_type: 'Partner transfer',
          amount: -amount, // Negative (they received money)
          notes: toNotes
        }
      ]

      // Submit both payments
      const res = await fetch(`${base}/api/partner-transfer`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({ payments })
})

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to create transfer (status ${res.status}) ${text?.slice(0,140)}`)
      }

      // Show confirmation
      alert(`Transfer of ${fmtMoney(amount)} to ${toPartnerName} completed successfully!`)

      // Reset form and hide
      setTransferAmount('')
      setTransferToPartnerId('')
      setTransferNotes('')
      setShowTransferForm(false)

      // Reload partner data to show new payment
      const reloadRes = await fetch(`${base}/api/partner?id=${encodeURIComponent(id!)}`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})
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

  const handleDebtPaymentSubmit = async () => {
    // Validation
    const amount = parseAmount(paymentAmount)
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    if (!paymentToPartnerId) {
      alert('Please select a creditor partner')
      return
    }

    setPaying(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const paymentDate = todayYMD(timezone)
      
      // Get partner names
      const creditors = data?.totals.creditors || []
      const toPartner = creditors.find(c => c.partner_id === paymentToPartnerId)
      const toPartnerName = toPartner?.partner_name || 'Unknown'

      // Submit payment
      const res = await fetch(`${base}/api/partner-debt-payment`, {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({
    from_partner_id: id,
    to_partner_id: paymentToPartnerId,
    amount: amount,
    payment_date: paymentDate,
    notes: paymentNotes.trim() || null
  })
})

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to create payment (status ${res.status}) ${text?.slice(0,140)}`)
      }

      // Show confirmation
      alert(`Payment of ${fmtMoney(amount)} to ${toPartnerName} completed successfully!`)

      // Reset form and hide
      setPaymentAmount('')
      setPaymentToPartnerId('')
      setPaymentNotes('')
      setShowPaymentForm(false)

      // Reload partner data
      const reloadRes = await fetch(`${base}/api/partner?id=${encodeURIComponent(id!)}`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})
      if (reloadRes.ok) {
        const d = await reloadRes.json()
        setData(d)
      }
    } catch (e: any) {
      console.error('Payment failed:', e)
      alert(`Payment failed: ${e.message}`)
    } finally {
      setPaying(false)
    }
  }

  // Format amount input with thousand separator and decimals
  const handleAmountChange = (value: string, setter: (v: string) => void) => {
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
      setter(`${integerPart}.${decimalPart}`)
    } else {
      // No decimal point yet
      setter(integerPart)
    }
  }

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{color:'var(--color-error)'}}>{t('error')} {err}</p></div>
  if (!data) return null

  const { partner, totals, orders, payments } = data

  // Compute total paid per order from payments list
  const paidByOrderId: Record<string, number> = {}
  for (const p of payments) {
    const oid = (p as any).order_id
    if (oid) paidByOrderId[oid] = (paidByOrderId[oid] || 0) + Number(p.amount)
  }

  // Show 5 by default
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 5)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 5)

  // Get creditors for this partner (who they owe money to)
  const creditors = totals.creditors || []
  const hasCreditors = creditors.length > 0

  // Get debtors (who owes this partner money)
  const debtors = totals.debtors || []

  // Compact layout constants (match CustomerDetail)
  const DATE_COL = 55
  const LINE_GAP = 4

  return (
    <div className="card page-normal" style={{paddingBottom: 12}}>
      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
        <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {partner.name}
        </h3>
        <Link
          to={`/partners/${partner.id}/edit`}
          className="helper"
          style={{ whiteSpace:'nowrap', textDecoration:'none', color:'var(--accent)' }}
        >
          {t('edit')}
        </Link>
        <button
          onClick={() => PrintManager.openPrintDialog()}
          className="helper"
          style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontSize:14, lineHeight:1 }}
          title="Print to PDF"
          aria-label="Print to PDF"
        >
          🖨️
        </button>
      </div>

      {/* P to P Transfer and P to P Payment buttons */}
      {showPartnerTransfer && (<>
        <div style={{ display:'flex', gap:8, marginTop: 12 }}>
          <button
            className="primary"
            onClick={() => {
              setShowTransferForm(v => !v)
              if (showPaymentForm) setShowPaymentForm(false)
            }}
            style={{
              width: 110,
              height: 28,
              fontSize: 12,
              padding: '0 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap'
            }}
          >
            {t('partners.partnerToPartnerTransfer')}
          </button>
          <button
            className="primary"
            onClick={() => {
              setShowPaymentForm(v => !v)
              if (showTransferForm) setShowTransferForm(false)
            }}
            disabled={!hasCreditors}
            style={{
              width: 110,
              height: 28,
              fontSize: 12,
              padding: '0 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              opacity: hasCreditors ? 1 : 0.4,
              cursor: hasCreditors ? 'pointer' : 'not-allowed'
            }}
            title={hasCreditors ? 'Make a debt payment to another partner' : t('partners.noDebtToOthers')}
          >
            {t('partners.partnerToPartnerPayment')}
          </button>
        </div>

      {/* Transfer Form (collapsible) */}
      {showTransferForm && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)' }}>
          {/* First row: Amount and To Partner */}
          <div className="row row-2col-mobile" style={{ marginBottom: 12 }}>
            <div>
              <label>{t('partners.amountUSD')}</label>
              <input
                type="text"
                value={transferAmount}
                onChange={(e) => handleAmountChange(e.target.value, setTransferAmount)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label>{t('partners.toPartner')}</label>
              <select
                value={transferToPartnerId}
                onChange={(e) => setTransferToPartnerId(e.target.value)}
              >
                <option value="">{t('partners.selectPartner')}</option>
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
                placeholder={t('optionalNotesPlaceholder')}
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
              {transferring ? t('partners.processing') : t('partners.makeTransfer')}
            </button>
          </div>
        </div>
      )}

      {/* Payment Form (collapsible) */}
      {showPaymentForm && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--line)' }}>
          {/* First row: Amount and To Partner */}
          <div className="row row-2col-mobile" style={{ marginBottom: 12 }}>
            <div>
              <label>{t('partners.amountUSD')}</label>
              <input
                type="text"
                value={paymentAmount}
                onChange={(e) => handleAmountChange(e.target.value, setPaymentAmount)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label>{t('partners.toPartner')}</label>
              <select
                value={paymentToPartnerId}
                onChange={(e) => setPaymentToPartnerId(e.target.value)}
              >
                <option value="">{t('partners.selectCreditor')}</option>
                {creditors.map(c => (
                  <option key={c.partner_id} value={c.partner_id}>
                    {c.partner_name} ({t('partners.owed')} {fmtMoney(c.net_owed)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Second row: Notes and Make payment button */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Notes</label>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder={t('optionalNotesPlaceholder')}
              />
            </div>
            <button
              className="primary"
              onClick={handleDebtPaymentSubmit}
              disabled={paying}
              style={{
                height: 'var(--control-h)',
                padding: '0 16px',
                whiteSpace: 'nowrap'
              }}
            >
              {paying ? t('partners.processing') : t('partners.makePayment')}
            </button>
          </div>
        </div>
      )}
      </>)}

      {/* Collapsible info */}
      <div style={{ marginTop: 12 }}>
        {!showInfo ? (
          <button
            className="helper"
            onClick={() => setShowInfo(true)}
            style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
          >
            {t('showInfo')}
          </button>
        ) : (
          <div>
            <button
              className="helper"
              onClick={() => setShowInfo(false)}
              style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
            >
              {t('hideInfo')}
            </button>

            <div style={{ marginTop: 10 }}>
              <div className="helper">{t('phone')}</div>
              <div>{partner.phone ? <a href={phoneHref(partner.phone)}>{partner.phone}</a> : '—'}</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="helper">{t('address')}</div>
              <div>
                {[partner.address1, partner.address2].filter(Boolean).join(', ') || '—'}
                {[partner.address1, partner.address2].filter(Boolean).length > 0 && <br/>}
                {[partner.city, partner.state, partner.postal_code].filter(Boolean).join(' ')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Total owed to partner */}
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />
      <div
        data-printable
        data-printable-id="owed"
        data-printable-title="Owed to Partner"
        style={{ display: 'grid', gap: 12 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('partners.owedToPartner')}</div>
          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(totals.net_owed)}</div>
        </div>
        {debtors.map(debtor => (
          <div
            key={debtor.partner_id}
            data-printable
            data-printable-id={`debtor-${debtor.partner_id}`}
            data-printable-title={`Owed by ${debtor.partner_name}`}
            style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}
          >
            <div className="helper">{t('partners.owedBy')} {debtor.partner_name}</div>
            <div style={{ textAlign: 'right', fontWeight: 600 }}>{fmtIntMoney(debtor.net_owed)}</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />

      {/* === Orders (CustomerDetail-like layout) === */}
      <section 
        data-printable
        data-printable-id="orders"
        data-printable-title="Orders with Partner Stake"
        style={{ marginTop: 20 }}
      >
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>{t('partners.ordersWithPartner')}</h4>
          {orders.length > 5 && (
            <button
              className="helper"
              onClick={() => setShowAllOrders(v => !v)}
              style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
            >
              {showAllOrders ? t('showLess') : t('showAllOrders')}
            </button>
          )}
        </div>

        {orders.length === 0 ? <p className="helper">{t('noOrdersYet')}</p> : (
          <div style={{display:'grid', marginTop:12}} data-print-rows>
            {shownOrders.map(o => {
              const middleLine2 = [
                o.product_name || '—',
                (o.qty ?? '—'),
                (o.unit_price != null ? fmtMoney(o.unit_price) : '—'),
                fmtMoney(o.total)
              ].join(' / ')

              return (
                <div key={o.id} data-print-row style={{ borderBottom: '1px solid var(--line)', paddingTop: 12, paddingBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `${DATE_COL}px 20px 1fr auto`, columnGap: 8, rowGap: LINE_GAP }}>
                  {/* DATE */}
                  <div className="helper" data-date={o.order_date}>
                    {formatDate(o.order_date)}
                  </div>

                  {/* spacer */}
                  <div></div>

                  {/* MIDDLE */}
                  <div
                    className="helper"
                    onClick={() => handleOrderClick(o)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>
                      {showOrderNumber && <span className="helper" style={{ marginRight: 6 }}>#{o.order_no}</span>}
                      <strong data-customer={o.customer_name}>{o.customer_name}</strong>
                    </div>
                    <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>
                      {middleLine2}
                    </div>
                  </div>

                  {/* RIGHT: Partner amount */}
                  {(() => {
                    const orderTotal = Number(o.partner_amount) || 0
                    const paid = paidByOrderId[o.id] || 0
                    const orderColor = paid >= orderTotal && orderTotal > 0
                      ? '#10b981'
                      : paid > 0 && paid < orderTotal
                        ? '#f59e0b'
                        : undefined
                    return (
                      <div
                        className="helper"
                        onClick={() => handleOrderClick(o)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        style={{ textAlign: 'right', cursor: 'pointer', color: orderColor }}
                        title="Partner amount"
                      >
                        {fmtMoney(orderTotal)}
                      </div>
                    )
                  })()}
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
          <h4 style={{margin:0}}>{t('partners.paymentsToPartner')}</h4>
          {payments.length > 5 && (
            <button
              className="helper"
              onClick={() => setShowAllPayments(v => !v)}
              style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
            >
              {showAllPayments ? t('showLess') : t('showAllPayments')}
            </button>
          )}
        </div>

        {payments.length === 0 ? <p className="helper">{t('noPaymentsYet')}</p> : (
          <div style={{display:'grid', marginTop:12}} data-print-rows>
            {shownPayments.map(p => {
              const notes = (p.notes ?? '').trim()
              const isOther = (p.payment_type || '').toLowerCase() === 'other'
              const isAddToDebt = (p.payment_type || '').toLowerCase() === 'add to debt'
              const mainLine = isOther ? (notes || 'Other') : p.payment_type

              const amountStr = isAddToDebt
                ? fmtMoney(Math.abs(p.amount))
                : `-${fmtMoney(Math.abs(p.amount))}`

              return (
                <div key={p.id} data-print-row style={{ borderBottom: '1px solid var(--line)', paddingTop: 12, paddingBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `${DATE_COL}px 20px 1fr auto`, columnGap: 8, rowGap: LINE_GAP }}>
                  {/* DATE */}
                  <div className="helper" data-date={p.payment_date}>
                    {formatDate(p.payment_date)}
                  </div>

                  {/* spacer */}
                  <div></div>

                  {/* TYPE (+ optional notes line) */}
                  <div
                    className="helper"
                    onClick={() => handlePaymentClick(p)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{ cursor: 'pointer' }}
                  >
                    <div>{mainLine}</div>
                    {showOrderNumber && p.order_no && (
                      <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>#{p.order_no}</div>
                    )}
                    {!isOther && notes && (
                      <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>
                        {notes}
                      </div>
                    )}
                  </div>

                  {/* AMOUNT */}
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





