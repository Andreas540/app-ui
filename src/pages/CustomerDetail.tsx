// src/pages/CustomerDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchCustomerDetail, type CustomerDetail, getAuthHeaders } from '../lib/api'
import { formatUSAny } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'
import PaymentDetailModal from '../components/PaymentDetailModal'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

export default function CustomerDetailPage() {
  const { t, i18n } = useTranslation()
  const { user, hasFeature } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  // --- Hooks (fixed, stable order) ---
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [deliveryOrder, setDeliveryOrder] = useState<any | null>(null)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [showShareOrder,      setShowShareOrder]      = useState(false)
  const [generatingOrderLink, setGeneratingOrderLink] = useState(false)
  const [orderLink,           setOrderLink]           = useState<string | null>(null)
  const [orderLinkCopied,     setOrderLinkCopied]     = useState(false)


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

  // --- Helpers (no hooks here) ---
  async function generateOrderLink() {
    if (!id) return
    setGeneratingOrderLink(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/customer-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: id, type: 'order', lang: i18n.language }),
      })
      const j = await res.json()
      if (j.url) setOrderLink(j.url)
    } catch { /* non-critical */ }
    finally { setGeneratingOrderLink(false) }
  }

  function copyOrderLink() {
    if (!orderLink) return
    navigator.clipboard.writeText(orderLink).then(() => {
      setOrderLinkCopied(true)
      setTimeout(() => setOrderLinkCopied(false), 2000)
    })
  }

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

  function formatPhoneDisplay(p?: string): string {
  if (!p) return '—'
  const digits = p.trim().replace(/\D/g, '')
  if (!digits) return p

  // 2-digit country codes (subset of most common)
  const CC2 = new Set([
    '20','27','30','31','32','33','34','36','39','40','41','43','44','45',
    '46','47','48','49','51','52','53','54','55','56','57','58','60','61',
    '62','63','64','65','66','81','82','84','86','90','91','92','93','94',
    '95','98'
  ])

  const ccLen = digits.startsWith('1') ? 1 : CC2.has(digits.slice(0, 2)) ? 2 : 1
  const cc   = digits.slice(0, ccLen)
  const rest = digits.slice(ccLen)
  const parts = [rest.slice(0, 3), rest.slice(3, 6), rest.slice(6)].filter(Boolean)
  return `+${cc} ${parts.join(' ')}`
}

  const handleOrderClick = (order: any) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  const handlePaymentClick = (payment: any) => {
    setSelectedPayment(payment)
    setShowPaymentModal(true)
  }

    const handleDeliveryIconClick = (order: any) => {
    setDeliveryOrder(order)
  }

  const handleDeliverySave = async (orderId: string, newDeliveredQuantity: number) => {
  try {
    setSavingDelivery(true)
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/orders-delivery`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        order_id: orderId, 
        delivered_quantity: newDeliveredQuantity
      }),
    })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to update delivery status (status ${res.status}) ${text?.slice(0,140)}`)
      }

      const updated = await res.json()

      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          orders: prev.orders.map(order => 
            order.id === orderId
              ? {
                  ...order,
                  delivered: updated.delivered,
                  delivered_quantity: updated.delivered_quantity,
                  delivery_status: updated.delivery_status,
                }
              : order
          )
        }
      })

      setDeliveryOrder(null)
    } catch (e: any) {
      console.error('Failed to update delivery status:', e)
      alert(`Failed to update delivery status: ${e.message}`)
    } finally {
      setSavingDelivery(false)
    }
  }

  if (loading) return <div className="card"><p>{t('loading')}</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>{t('error')} {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data
  const addrLine1 = [customer.address1, customer.address2].filter(Boolean).join(', ')
  const addrLine2 = [customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ')
  const isPartnerCustomer = customer.customer_type === 'Partner'

  // Show 5 by default
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 5)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 5)

  // Compute total paid per order from payments list
  const paidByOrderId: Record<string, number> = {}
  for (const p of payments) {
    const oid = (p as any).order_id
    if (oid) {
      paidByOrderId[oid] = (paidByOrderId[oid] || 0) + Number((p as any).amount)
    }
  }

  // Compact layout constants
  const DATE_COL = 55 // px (smaller; pulls middle text left)
  const LINE_GAP = 4  // tighter than default

  return (
    <div className="card" style={{maxWidth: 960, paddingBottom: 12}}>
      {/* Header row: Name + Edit (left), Back link (right) */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
          <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {customer.name}
          </h3>
          <Link
            to={`/customers/${customer.id}/edit`}
            className="icon-btn"
            title={t('customerDetail.editCustomer')}
            aria-label={t('customerDetail.editCustomer')}
            style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1, borderRadius: 6 }}
          >
            ✎
          </Link>
        </div>

        <Link to="/customers" className="helper" style={{ whiteSpace:'nowrap' }}>
          {t('customerDetail.backToCustomers')}
        </Link>
      </div>

      {/* Action row under name: New order + New payment */}
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <Link
          to={`/orders/new?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}&return_to=customer&return_id=${customer.id}`}
          style={{ textDecoration: 'none' }}
        >
          <button
            className="primary"
            style={{
              width: 100,           // equal width
              height: 28,
              fontSize: 12,
              padding: '0 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap'
            }}
          >
            {t('newOrder')}
          </button>
        </Link>

        <Link
          to={`/payments?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}&return_to=customer&return_id=${customer.id}`}
          style={{ textDecoration: 'none' }}
        >
          <button
            className="primary"
            style={{
              width: 100,           // equal width; wide enough for full label
              height: 28,
              fontSize: 12,
              padding: '0 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap'
            }}
          >
            {t('newPayment')}
          </button>
        </Link>

        {hasFeature('new-booking') && (
          <Link
            to={`/bookings/new?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}`}
            style={{ textDecoration: 'none' }}
          >
            <button
              className="primary"
              style={{
                height: 28,
                fontSize: 12,
                padding: '0 10px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {t('newBooking.title', 'New Booking')}
            </button>
          </Link>
        )}
      </div>

      {/* Share order page with customer */}
      <div style={{ marginTop: 12, marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => setShowShareOrder(v => !v)}
          className="helper"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
        >
          {t('customers.shareOrderPage')}
        </button>

        {showShareOrder && (
          <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
            <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>{t('customers.shareOrderLine1')}</p>
            <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{t('customers.shareOrderLine2')}</p>
            {!orderLink ? (
              <button
                type="button"
                onClick={generateOrderLink}
                disabled={generatingOrderLink}
                style={{ height: 36, padding: '0 16px', fontSize: 13 }}
              >
                {generatingOrderLink ? t('customers.generating') : t('customers.shareLink')}
              </button>
            ) : (
              <div>
                <p style={{ margin: '0 0 6px', fontWeight: 500 }}>{t('customers.linkReady')}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    readOnly
                    value={orderLink}
                    style={{ flex: 1, minWidth: 0, height: 36, fontSize: 12, padding: '0 8px' }}
                    onFocus={e => e.target.select()}
                  />
                  <button type="button" onClick={copyOrderLink} style={{ height: 36, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
                    {orderLinkCopied ? t('customers.copied') : t('customers.copyLink')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
                <div className="helper">{t('customerDetail.type')}</div>
                <div>{customer.customer_type}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">{t('customerDetail.shippingCost')}</div>
                <div>{fmtMoney((customer as any).shipping_cost ?? 0)}</div>
              </div>

              {/* ✨ NEW: Company name */}
              <div style={{ marginTop: 12 }}>
                <div className="helper">{t('contact.title')}</div>
                <div>{customer.company_name || '—'}</div>
              </div>
              {/* ✨ END NEW */}

              <div style={{ marginTop: 12 }}>
                <div className="helper">{t('phone')}</div>
                <div>{customer.phone ? <a href={phoneHref(customer.phone)}>{formatPhoneDisplay(customer.phone)}</a> : '—'}</div>

              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">{t('address')}</div>
                <div>
                  {addrLine1 || addrLine2 || customer.country ? (
                    <>
                      {addrLine1 && <div>{addrLine1}</div>}
                      {addrLine2 && <div>{addrLine2}</div>}
                      {customer.country && <div>{customer.country}</div>}
                    </>
                  ) : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ textAlign:'right' }}>
          <div className="helper">{t('customerDetail.owedToMe')}</div>
          <div style={{ fontWeight: 700 }}>{fmtMoney((totals as any).owed_to_me)}</div>
        </div>
      </div>

      {/* Recent orders */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>{t('customerDetail.recentOrders')}</h4>
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
          <div style={{display:'grid'}}>
            {shownOrders.map(o => {
              const cols = `${DATE_COL}px 20px auto 1fr auto`

              const items: Array<{ product_name: string | null; qty: number; unit_price: number }> =
                Array.isArray((o as any).items) && (o as any).items.length > 0
                  ? (o as any).items
                  : []

              const itemLine = (item: { product_name: string | null; qty: number; unit_price: number }) => {
                const suffix = isPartnerCustomer && (o as any).partner_amount != null && items.indexOf(item) === 0
                  ? ` / ${fmtIntMoney((o as any).partner_amount)}`
                  : ''
                return `${item.product_name ?? 'Service'} / ${Number(item.qty).toLocaleString('en-US')} / ${fmtMoney(item.unit_price ?? 0)}${suffix}`
              }

              const hasNotes = (o as any).notes && (o as any).notes.trim()
              const orderTotal = Number((o as any).total) || 0
              const paid = paidByOrderId[o.id] || 0
              const orderColor = paid >= orderTotal && orderTotal > 0
                ? '#10b981'
                : paid > 0 && paid < orderTotal
                  ? '#f59e0b'
                  : undefined

              const deliveryIcon = (() => {
                const status = (o as any).delivery_status || ((o as any).delivered ? 'delivered' : 'not_delivered')
                const deliveredQty = (o as any).delivered_quantity ?? 0
                const totalQty = (o as any).total_qty ?? 0
                let symbol = '○', color = '#d1d5db', title = t('notDelivered')
                if (status === 'delivered') { symbol = '✓'; color = '#10b981'; title = t('customerDetail.deliveredInFull') }
                else if (status === 'partial') { symbol = '◐'; color = '#f59e0b'; title = t('customerDetail.partiallyDelivered', { delivered: deliveredQty, total: totalQty }) }
                return (
                  <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeliveryIconClick(o) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} title={title}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, fontSize: 14, lineHeight: 1, color }}>{symbol}</span>
                    </button>
                  </div>
                )
              })()

              return (
                <div key={o.id} style={{ borderBottom: '1px solid #eee', paddingTop: 12, paddingBottom: 12 }}>

                  {/* FIRST ITEM ROW — date, delivery icon, order_no, first item, total */}
                  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: LINE_GAP }}>
                    <div className="helper">{formatUSAny((o as any).order_date)}</div>
                    {deliveryIcon}
                    <div className="helper" style={{ whiteSpace: 'nowrap' }}>#{(o as any).order_no}</div>
                    <div className="helper" onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                      {items.length > 0 ? itemLine(items[0]) : t('customerDetail.orderLines', { count: 0 })}
                    </div>
                    <div className="helper" onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ textAlign: 'right', cursor: 'pointer', color: orderColor }}>
                      {fmtMoney(orderTotal)}
                    </div>
                  </div>

                  {/* ADDITIONAL ITEM ROWS */}
                  {items.slice(1).map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: cols, gap: LINE_GAP, marginTop: LINE_GAP }}>
                      <div /><div /><div />
                      <div className="helper" onClick={() => handleOrderClick(o)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                        {itemLine(item)}
                      </div>
                      <div />
                    </div>
                  ))}

                  {/* NOTES ROW */}
                  {hasNotes && (
                    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: LINE_GAP, marginTop: 4 }}>
                      <div /><div /><div />
                      <div className="helper" onClick={() => handleOrderClick(o)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                        {(o as any).notes}
                      </div>
                      <div />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>{t('customerDetail.recentPayments')}</h4>
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
          <div style={{display:'grid'}}>
            {shownPayments.map(p => {
              const hasNotes = (p as any).notes && (p as any).notes.trim()
              const amt = Number((p as any).amount) || 0
              const abs2dec = Math.abs(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

              // Display rule:
              //  - positive amounts => "-$xx.xx" (reduce what’s owed)
              //  - negative amounts => "$xx.xx"  (do NOT show a minus)
              const amountDisplay = amt < 0
                ? `$${abs2dec}`
                : `-$${abs2dec}`

              return (
                <div
                  key={p.id}
                  style={{
                    borderBottom:'1px solid #eee',
                    paddingTop: '12px',
                    paddingBottom: '12px'
                  }}
                >
                  <div
                    style={{
                      display:'grid',
                      gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                      gap:LINE_GAP,
                    }}
                  >
                    {/* DATE */}
                    <div className="helper">{formatUSAny((p as any).payment_date)}</div>

                    {/* EMPTY COLUMN for alignment with orders checkmark column */}
                    <div></div>

                    {/* TYPE */}
                    <div 
                      className="helper"
                      onClick={() => handlePaymentClick(p)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ cursor: 'pointer', lineHeight: '1.4' }}
                    >
                      {(p as any).payment_type}{(p as any).order_no ? ` · #${(p as any).order_no}` : ''}
                    </div>

                    {/* AMOUNT with conditional sign, 2 decimals */}
                    <div 
                      className="helper" 
                      onClick={() => handlePaymentClick(p)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{textAlign:'right', cursor: 'pointer'}}
                    >
                      {amountDisplay}
                    </div>
                  </div>

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
                      <div 
                        className="helper"
                        onClick={() => handlePaymentClick(p)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        style={{ cursor: 'pointer', lineHeight: '1.4' }}
                      >
                        {(p as any).notes}
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

            <OrderDetailModal 
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
      />

      <PaymentDetailModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        payment={selectedPayment}
        isPartnerPayment={false}
      />

      {/* DELIVERY MODAL (tri-state) */}
      {deliveryOrder && (
        <DeliveryModal
          order={deliveryOrder}
          saving={savingDelivery}
          onClose={() => setDeliveryOrder(null)}
          onSave={handleDeliverySave}
        />
      )}
    </div>
  )
}
function DeliveryModal({
  order,
  saving,
  onClose,
  onSave,
}: {
  order: any
  saving: boolean
  onClose: () => void
  onSave: (orderId: string, newDeliveredQuantity: number) => void
}) {
  const { t } = useTranslation()

  const totalQty = (order as any).total_qty ?? (order as any).qty ?? 0
  const initialDelivered =
    (order as any).delivered_quantity ??
    ((order as any).delivered ? totalQty : 0)

  // Keep the raw input as a string so the user can clear it
  const [inputValue, setInputValue] = useState<string>(
    String(initialDelivered)
  )

  // Parse and clamp for display / status / save
  const parsed = Number(inputValue)
  const numeric = Number.isFinite(parsed) ? parsed : 0
  const clampedValue = Math.max(0, Math.min(numeric, totalQty))
  const remaining = totalQty - clampedValue

  let statusLabel = t('notDelivered')
  if (clampedValue === 0) statusLabel = t('notDelivered')
  else if (clampedValue === totalQty) statusLabel = t('customerDetail.deliveredInFullStatus')
  else statusLabel = t('customerDetail.partiallyDelivered', { delivered: clampedValue, total: totalQty })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 360, width: '90%', padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 style={{ marginTop: 0, marginBottom: 8 }}>{t('customerDetail.updateDelivery')}</h4>

        <div className="helper" style={{ marginBottom: 8 }}>
          Order #{(order as any).order_no ?? order.id}
        </div>

        <div className="helper" style={{ marginBottom: 4 }}>
          {t('customerDetail.orderedQty')}
        </div>
        <div style={{ marginBottom: 8 }}>{totalQty}</div>

        <div className="helper" style={{ marginBottom: 4 }}>
          {t('customerDetail.deliveredQty')}
        </div>
        <input
          type="number"
          min={0}
          max={totalQty}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={(e) => {
            // When starting from 0, clear the field on first focus
            if (e.target.value === '0') {
              setInputValue('')
            }
          }}
          style={{ width: '100%', marginBottom: 8 }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className="helper"
            onClick={() => setInputValue('0')}
            style={{ flex: 1 }}
          >
            {t('customerDetail.setToZero')}
          </button>
          <button
            type="button"
            className="helper"
            onClick={() => setInputValue(String(totalQty))}
            style={{ flex: 1 }}
          >
            {t('customerDetail.fullDelivery')}
          </button>
        </div>

        <div className="helper" style={{ marginBottom: 4 }}>
          {t('customerDetail.newStatus')}
        </div>
        <div style={{ marginBottom: 12 }}>
          {statusLabel}{' '}
          {totalQty > 0 && remaining !== 0 && t('customerDetail.partiallyDeliveredWithRemaining', { remaining })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="helper"
            onClick={onClose}
            disabled={saving}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onSave(order.id, clampedValue)}
            disabled={saving}
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}







