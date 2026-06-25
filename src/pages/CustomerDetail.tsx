// src/pages/CustomerDetail.tsx
import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { fetchCustomerDetail, type CustomerDetail, getAuthHeaders, listProducts, type ProductWithCost, tPaymentType } from '../lib/api'
import { formatDate, todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'
import OrderDetailModal from '../components/OrderDetailModal'
import PaymentDetailModal from '../components/PaymentDetailModal'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import { useCurrency } from '../lib/useCurrency'

type Platform = 'ios' | 'android' | 'mac' | 'windows' | 'other'

function getPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Macintosh|MacIntel/i.test(ua)) return 'mac'
  if (/Windows/i.test(ua)) return 'windows'
  return 'other'
}

function PlatformShareIcon({ platform }: { platform: Platform }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (platform === 'android') return (
    // Three connected circles — standard Android share
    <svg {...p}>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
  if (platform === 'windows') return (
    // Send/forward arrow — Windows share style
    <svg {...p}>
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
  // iOS / macOS / other: box with upward arrow — Apple share icon
  return (
    <svg {...p}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

export default function CustomerDetailPage() {
  const { t, i18n } = useTranslation()
  const { t: ti } = useTranslation('info')
  const { hasFeature, user } = useAuth()
  const tenantConfig = getTenantConfig(user?.tenantId)
  const tenantUi = tenantConfig.ui
  const directLabel = tenantConfig.labels.directLabel
  const compactOrderRows = tenantUi.compactCustomerOrderRows
  const showOrderNumber = tenantUi.showOrderNumberInList
  const platform = getPlatform()
  const cfgShowNewOrder      = tenantUi.customerDetailShowNewOrder
  const cfgShowNewPayment    = tenantUi.customerDetailShowNewPayment
  const cfgShowNewInvoice    = tenantUi.customerDetailShowNewInvoice
  const cfgShowNewBooking    = tenantUi.customerDetailShowNewBooking && hasFeature('new-booking')
  const cfgShowShareBooking  = tenantUi.customerDetailShowShareBooking && hasFeature('new-booking')
  const cfgShowShareOrder      = tenantUi.customerDetailShowShareOrder
  const cfgShowConversation    = tenantUi.customerDetailShowConversation
  // --- Hooks (fixed, stable order) ---
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showPageInfo, setShowPageInfo] = useState(false)
  const [showOrdersInfo, setShowOrdersInfo] = useState(false)
  const [showPaymentsInfo, setShowPaymentsInfo] = useState(false)
  const [paymentMenuOrderId, setPaymentMenuOrderId] = useState<string | null>(null)
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [deliveryOrder, setDeliveryOrder] = useState<any | null>(null)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [showShareOrder,        setShowShareOrder]        = useState(false)
  const [generatingOrderLink,   setGeneratingOrderLink]   = useState(false)
  const [orderLink,             setOrderLink]             = useState<string | null>(null)
  const [orderLinkCopied,       setOrderLinkCopied]       = useState(false)
  const [productsNeedingPrice,  setProductsNeedingPrice]  = useState<ProductWithCost[]>([])
  const [showShareBooking,      setShowShareBooking]      = useState(false)
  const [generatingBookingLink, setGeneratingBookingLink] = useState(false)
  const [bookingLink,           setBookingLink]           = useState<string | null>(null)
  const [bookingLinkCopied,     setBookingLinkCopied]     = useState(false)
  const [bookingLinkError,      setBookingLinkError]      = useState<string | null>(null)


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

  useEffect(() => {
    if (!showShareOrder) return
    listProducts().then(({ products }) => {
      setProductsNeedingPrice(products.filter(p => (p.category ?? 'product') === 'product' && p.price_amount == null))
    }).catch(() => {})
  }, [showShareOrder])

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

  async function generateBookingLink() {
    if (!id) return
    setGeneratingBookingLink(true)
    setBookingLinkError(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/customer-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: id, type: 'booking' }),
      })
      const j = await res.json()
      if (j.url) setBookingLink(j.url)
      else setBookingLinkError(j.error || t('customers.bookingLinkError'))
    } catch { setBookingLinkError(t('customers.bookingLinkError')) }
    finally { setGeneratingBookingLink(false) }
  }

  async function generatePaymentLink(orderId: string) {
    setGeneratingPaymentLink(true)
    setPaymentLinkUrl(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/create-order-payment-link`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate link')
      setPaymentLinkUrl(data.checkout_url)
    } catch (e: any) {
      alert(e?.message || 'Failed to generate payment link')
    } finally {
      setGeneratingPaymentLink(false)
    }
  }

  function copyPaymentLink() {
    if (!paymentLinkUrl) return
    navigator.clipboard.writeText(paymentLinkUrl).then(() => {
      setPaymentLinkCopied(true)
      setTimeout(() => setPaymentLinkCopied(false), 2000)
    })
  }

  function copyBookingLink() {
    if (!bookingLink) return
    navigator.clipboard.writeText(bookingLink).then(() => {
      setBookingLinkCopied(true)
      setTimeout(() => setBookingLinkCopied(false), 2000)
    })
  }

  const { fmtMoney, fmtIntMoney } = useCurrency()
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

  const handleDeliverySave = async (orderId: string, newDeliveredQuantity: number, deliveredAt?: string) => {
  try {
    setSavingDelivery(true)
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/orders-delivery`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        order_id: orderId,
        delivered_quantity: newDeliveredQuantity,
        delivered_at: deliveredAt || null,
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
                  delivered_at: updated.delivered_at,
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

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{color:'var(--color-error)'}}>{t('error')} {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments, hasPaymentProvider } = data
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
    <div className="card page-normal" style={{paddingBottom: 12}}>
      {/* Header row: Name + Edit link */}
      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
        <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {customer.name}
        </h3>
        <Link
          to={`/customers/${customer.id}/edit`}
          className="helper"
          style={{ whiteSpace:'nowrap', textDecoration:'none', color:'var(--accent)' }}
        >
          {t('edit')}
        </Link>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/admin', { state: { openTab: 'ui-settings', uiSection: 'customer-detail' } })}
          title={t('customizeSection', 'Customize')}
          style={{
            background: 'none', border: 'none', padding: 4, cursor: 'pointer', flexShrink: 0,
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <circle cx="8" cy="6" r="2" fill="var(--bg)" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <circle cx="14" cy="12" r="2" fill="var(--bg)" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="18" r="2" fill="var(--bg)" />
          </svg>
        </button>
        {tenantUi.showInfoIconsPages && (
          <button
            onClick={() => setShowPageInfo(v => !v)}
            style={{
              width: 20, height: 20, padding: 0, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', cursor: 'pointer',
              background: 'var(--border, rgba(0,0,0,0.08))',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >i</button>
        )}
      </div>

      {showPageInfo && (
        <div style={{
          marginTop: 12, marginBottom: 4,
          background: 'var(--card, #fff)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ti('customerDetail.title')}</div>
            <button
              onClick={() => setShowPageInfo(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >✕</button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['p1','p2','p3','p4','p5'] as const).map(k => (
              <p key={k} style={{ margin: 0 }}>{ti(`customerDetail.${k}`)}</p>
            ))}
          </div>
        </div>
      )}

      {showOrdersInfo && (
        <div style={{
          marginTop: 12, marginBottom: 4,
          background: 'var(--card, #fff)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ti('customerDetailOrders.title')}</div>
            <button
              onClick={() => setShowOrdersInfo(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >✕</button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['p1','p2','p3','p4','p5','p6'] as const).map(k => (
              k === 'p2' ? (
                <p key={k} style={{ margin: 0 }}>
                  <Trans
                    i18nKey="customerDetailOrders.p2"
                    ns="info"
                    components={{
                      adminLink: <Link to="/admin" state={{ openTab: 'ui-settings' }} style={{ color: 'var(--accent)' }} onClick={() => setShowOrdersInfo(false)} />,
                    }}
                  />
                </p>
              ) : k === 'p3' ? (
                <p key={k} style={{ margin: 0 }}>
                  <Trans
                    i18nKey="customerDetailOrders.p3"
                    ns="info"
                    components={{
                      amber: <span style={{ color: '#f59e0b' }} />,
                      green: <span style={{ color: '#10b981' }} />,
                    }}
                  />
                </p>
              ) : (
                <p key={k} style={{ margin: 0 }}>{ti(`customerDetailOrders.${k}`)}</p>
              )
            ))}
          </div>
        </div>
      )}

      {showPaymentsInfo && (
        <div style={{
          marginTop: 12, marginBottom: 4,
          background: 'var(--card, #fff)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ti('customerDetailPayments.title')}</div>
            <button
              onClick={() => setShowPaymentsInfo(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >✕</button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['p1','p2','p3'] as const).map(k => (
              <p key={k} style={{ margin: 0 }}>{ti(`customerDetailPayments.${k}`)}</p>
            ))}
          </div>
        </div>
      )}

      {paymentLinkUrl && (
        <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 500 }}>{t('customers.linkReady')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input readOnly value={paymentLinkUrl}
              style={{ flex: 1, minWidth: 0, height: 36, fontSize: 12, padding: '0 8px' }}
              onFocus={e => e.target.select()} />
            <button type="button" onClick={copyPaymentLink}
              style={{ height: 36, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
              {paymentLinkCopied ? t('customers.copied') : t('customers.copyLink')}
            </button>
            <button type="button" onClick={() => setPaymentLinkUrl(null)}
              style={{ height: 36, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* Unified action row — wraps to 3 per row on mobile (3×100px + 2×8px gap = 316px) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {/* Default buttons — alphabetical: Message, New Invoice, New Order, New Payment */}
        {cfgShowConversation && (
          <Link to={`/customers/${customer.id}/conversation`} style={{ textDecoration: 'none' }}>
            <button className="primary" style={{ width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              {t('conversation.button')}
            </button>
          </Link>
        )}
        {cfgShowNewInvoice && (
          <Link
            to={`/invoices/create?customer_id=${customer.id}`}
            style={{ textDecoration: 'none' }}
          >
            <button className="primary" style={{ width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              {t('newInvoice')}
            </button>
          </Link>
        )}
        {cfgShowNewOrder && (
          <Link
            to={`/orders/new?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}&return_to=customer&return_id=${customer.id}`}
            style={{ textDecoration: 'none' }}
          >
            <button className="primary" style={{ width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              {t('newOrder')}
            </button>
          </Link>
        )}
        {cfgShowNewPayment && (
          <Link
            to={`/payments?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}&return_to=customer&return_id=${customer.id}`}
            style={{ textDecoration: 'none' }}
          >
            <button className="primary" style={{ width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              {t('newPayment')}
            </button>
          </Link>
        )}
        {/* Non-default buttons — New Booking first, then share buttons together (alphabetical) */}
        {cfgShowNewBooking && (
          <Link
            to={`/bookings/new?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}`}
            style={{ textDecoration: 'none' }}
          >
            <button className="primary" style={{ width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
              {t('newBooking.title', 'New Booking')}
            </button>
          </Link>
        )}
        {cfgShowShareBooking && (
          <button
            type="button"
            onClick={() => {
              if (!showShareBooking) {
                setShowShareBooking(true)
                if (!bookingLink) generateBookingLink()
              } else {
                setShowShareBooking(false)
              }
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}
          >
            <PlatformShareIcon platform={platform} />
            {t('customers.shareBookingShort')}
          </button>
        )}
        {cfgShowShareOrder && (
          <button
            type="button"
            onClick={() => {
              if (!showShareOrder) {
                setShowShareOrder(true)
                if (!orderLink) generateOrderLink()
              } else {
                setShowShareOrder(false)
              }
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: 100, height: 28, fontSize: 12, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap' }}
          >
            <PlatformShareIcon platform={platform} />
            {t('customers.shareOrderShort')}
          </button>
        )}
      </div>

      {/* Share booking expand panel */}
      {cfgShowShareBooking && showShareBooking && (
        <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{t('customers.shareBookingLine1')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              readOnly
              value={bookingLink ?? ''}
              placeholder={generatingBookingLink ? t('customers.generating') : ''}
              style={{ flex: 1, minWidth: 0, height: 36, fontSize: 12, padding: '0 8px' }}
              onFocus={e => e.target.select()}
            />
            <button type="button" onClick={copyBookingLink} disabled={!bookingLink} style={{ height: 36, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
              {bookingLinkCopied ? t('customers.copied') : t('customers.copyLink')}
            </button>
          </div>
          {bookingLinkError && (
            <p style={{ margin: '0 0 8px', color: 'var(--color-error)', fontSize: 12 }}>{bookingLinkError}</p>
          )}
          <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>{t('customers.shareBookingLine2')}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('customers.shareBookingCustomizeText')}{' '}
            <button
              type="button"
              onClick={() => navigate('/admin', { state: { openBookingTab: true, openBookingSubTab: 'customer-booking', customerId: customer.id } })}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
            >
              {t('customers.shareOrderCustomizeLink')}
            </button>
          </p>
        </div>
      )}

      {/* Share order expand panel */}
      {cfgShowShareOrder && showShareOrder && (
        <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{t('customers.shareOrderLine1')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              readOnly
              value={orderLink ?? ''}
              placeholder={generatingOrderLink ? t('customers.generating') : ''}
              style={{ flex: 1, minWidth: 0, height: 36, fontSize: 12, padding: '0 8px' }}
              onFocus={e => e.target.select()}
            />
            <button type="button" onClick={copyOrderLink} disabled={!orderLink} style={{ height: 36, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
              {orderLinkCopied ? t('customers.copied') : t('customers.copyLink')}
            </button>
          </div>
          {productsNeedingPrice.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--color-warning-bg)', borderRadius: 6, fontSize: 12 }}>
              <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)' }}>{t('customers.shareOrderMissingPrices')}</p>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {productsNeedingPrice.map(p => (
                  <li key={p.id}>
                    <Link to={`/products/edit?type=product&id=${p.id}`} style={{ color: 'var(--accent)' }}>{p.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>{t('customers.shareOrderLine2')}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('customers.shareOrderCustomizeText')}{' '}
            <button
              type="button"
              onClick={() => navigate('/admin', { state: { openTab: 'order-page', openOrderSubTab: 'customer-order', customerId: customer.id } })}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
            >
              {t('customers.shareOrderCustomizeLink')}
            </button>
          </p>
        </div>
      )}

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
                <div className="helper">{t('customerDetail.type')}</div>
                <div>{(customer.customer_type === 'Direct' || customer.customer_type === 'BLV') ? directLabel : customer.customer_type}</div>
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
                <div className="helper">{t('email')}</div>
                <div>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : '—'}</div>
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

      {/* Total owed by customer */}
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('customerDetail.totalOwedByCustomer')}</div>
        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{fmtMoney((totals as any).owed_to_me)}</div>
      </div>
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />

      {/* Recent orders */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h4 style={{margin:0}}>{t('customerDetail.recentOrders')}</h4>
            {tenantUi.showInfoIconsPages && (
              <button
                onClick={() => setShowOrdersInfo(v => !v)}
                style={{
                  width: 20, height: 20, padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', cursor: 'pointer',
                  background: 'var(--border, rgba(0,0,0,0.08))',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >i</button>
            )}
          </div>
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
              const cols = showOrderNumber
                ? `50px 18px minmax(24px, max-content) 1fr auto`
                : `50px 18px 1fr auto`

              const items: Array<{ product_name: string | null; qty: number; unit_price: number }> =
                Array.isArray((o as any).items) && (o as any).items.length > 0
                  ? (o as any).items
                  : []

              const itemLine = (item: { product_name: string | null; qty: number; unit_price: number }) => {
                if (compactOrderRows) {
                  return `${item.product_name ?? 'Service'} / ${Number(item.qty).toLocaleString('en-US')}`
                }
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
                  <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'start' }}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeliveryIconClick(o) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} title={title}>
                      {status === 'not_delivered'
          ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
              <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: '50%', border: `1.5px solid ${color}` }} />
            </span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, fontSize: 16, lineHeight: 1, color }}>{symbol}</span>
        }
                    </button>
                  </div>
                )
              })()

              return (
                <div key={o.id} style={{ borderBottom: '1px solid var(--line)', paddingTop: 12, paddingBottom: 12 }}>
                  {/* Single shared grid — auto column sized by #no, all item rows align beneath it */}
                  <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8, rowGap: LINE_GAP }}>

                    {/* ROW 1: date | icon | [#no] | first item | total */}
                    <div className="helper">{formatDate((o as any).order_date)}</div>
                    {deliveryIcon}
                    {showOrderNumber && <div className="helper" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>#{(o as any).order_no}</div>}
                    <div className="helper" onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                      {items.length > 0 ? itemLine(items[0]) : t('customerDetail.orderLines', { count: 0 })}
                    </div>
                    <div className="helper"
                      onClick={orderTotal > paid && orderTotal > 0 ? (e) => {
                        e.stopPropagation()
                        if (!hasPaymentProvider) {
                          const balance = orderTotal - paid
                          navigate(`/payments?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}&order_id=${o.id}&amount=${balance}&return_to=customer&return_id=${customer.id}`)
                        } else {
                          setPaymentMenuOrderId(prev => prev === o.id ? null : o.id)
                        }
                      } : undefined}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ textAlign: 'right', cursor: orderTotal > paid && orderTotal > 0 ? 'pointer' : 'default', color: orderColor, position: 'relative' }}>
                      {fmtMoney(orderTotal)}
                      {paymentMenuOrderId === o.id && (
                        <>
                          <div
                            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                            onClick={(e) => { e.stopPropagation(); setPaymentMenuOrderId(null) }}
                          />
                          <div style={{
                            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                            background: 'var(--card, #1e2130)',
                            border: '1px solid var(--border)', borderRadius: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                            minWidth: 190, padding: '4px 0',
                            textAlign: 'left',
                          }}>
                            {[
                              { label: t('customers.registerPayment'), action: () => {
                                setPaymentMenuOrderId(null)
                                const balance = Math.max(0, orderTotal - paid)
                                const amount = balance > 0 ? balance : orderTotal
                                navigate(`/payments?customer_id=${customer.id}&customer_name=${encodeURIComponent(customer.name)}&order_id=${o.id}&amount=${amount}&return_to=customer&return_id=${customer.id}`)
                              }},
                              { label: generatingPaymentLink ? t('customers.generating') : t('customers.createPaymentLink'), action: () => {
                                setPaymentMenuOrderId(null)
                                generatePaymentLink(o.id)
                              }},
                            ].map(item => (
                              <button
                                key={item.label}
                                onClick={(e) => { e.stopPropagation(); item.action() }}
                                disabled={generatingPaymentLink}
                                style={{
                                  display: 'block', width: '100%',
                                  padding: '9px 14px', background: 'transparent',
                                  border: 'none', textAlign: 'left',
                                  cursor: 'pointer', fontSize: 13,
                                  color: 'var(--text)', whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--panel)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* ADDITIONAL ITEM ROWS: empty | empty | [empty] | item | empty */}
                    {items.slice(1).map((item, idx) => (
                      <React.Fragment key={idx}>
                        <div /><div />{showOrderNumber && <div />}
                        <div className="helper" onClick={() => handleOrderClick(o)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                          {itemLine(item)}
                        </div>
                        <div />
                      </React.Fragment>
                    ))}

                    {/* NOTES ROW: empty | empty | [empty] | notes | empty */}
                    {hasNotes && !compactOrderRows && (
                      <React.Fragment>
                        <div /><div />{showOrderNumber && <div />}
                        <div className="helper" onClick={() => handleOrderClick(o)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                          {(o as any).notes}
                        </div>
                        <div />
                      </React.Fragment>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h4 style={{margin:0}}>{t('customerDetail.recentPayments')}</h4>
            {tenantUi.showInfoIconsPages && (
              <button
                onClick={() => setShowPaymentsInfo(v => !v)}
                style={{
                  width: 20, height: 20, padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', cursor: 'pointer',
                  background: 'var(--border, rgba(0,0,0,0.08))',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >i</button>
            )}
          </div>
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
              // Display rule:
              //  - positive amounts => "-xx.xx" (reduce what’s owed)
              //  - negative amounts => "xx.xx"  (do NOT show a minus)
              const amountDisplay = amt < 0
                ? fmtMoney(Math.abs(amt))
                : fmtMoney(-Math.abs(amt))

              return (
                <div
                  key={p.id}
                  style={{
                    borderBottom:'1px solid var(--line)',
                    paddingTop: '12px',
                    paddingBottom: '12px'
                  }}
                >
                  <div
                    style={{
                      display:'grid',
                      gridTemplateColumns: showOrderNumber
                        ? `${DATE_COL}px 20px minmax(24px, max-content) 1fr auto`
                        : `${DATE_COL}px 20px 1fr auto`,
                      columnGap: 8,
                      rowGap: LINE_GAP,
                    }}
                  >
                    {/* DATE */}
                    <div className="helper">{formatDate((p as any).payment_date)}</div>

                    {/* EMPTY COLUMN for alignment with orders delivery icon column */}
                    <div></div>

                    {/* ORDER # — own column when showOrderNumber, inline otherwise */}
                    {showOrderNumber && (
                      <div className="helper" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {(p as any).order_no ? `#${(p as any).order_no}` : ''}
                      </div>
                    )}

                    {/* TYPE */}
                    <div
                      className="helper"
                      onClick={() => handlePaymentClick(p)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ cursor: 'pointer', lineHeight: '1.4' }}
                    >
                      {tPaymentType((p as any).payment_type, t)}{!showOrderNumber && (p as any).order_no ? ` · #${(p as any).order_no}` : ''}
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
                        gridTemplateColumns: showOrderNumber
                          ? `${DATE_COL}px 20px minmax(24px, max-content) 1fr auto`
                          : `${DATE_COL}px 20px 1fr auto`,
                        columnGap: 8,
                        rowGap: LINE_GAP,
                        marginTop: 4
                      }}
                    >
                      <div></div><div></div>{showOrderNumber && <div></div>}
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
  onSave: (orderId: string, newDeliveredQuantity: number, deliveredAt?: string) => void
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
  const [deliveredAt, setDeliveredAt] = useState<string>(
    (order as any).delivered_at ?? todayYMD()
  )
  const hasInteracted = useRef(false)

  function touchDate() {
    if (!hasInteracted.current) {
      hasInteracted.current = true
      setDeliveredAt(todayYMD())
    }
  }

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
          onChange={(e) => { touchDate(); setInputValue(e.target.value) }}
          onFocus={(e) => {
            touchDate()
            if (e.target.value === '0') setInputValue('')
          }}
          style={{ width: '100%', marginBottom: 8 }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className="helper"
            onClick={() => { touchDate(); setInputValue('0') }}
            style={{ flex: 1 }}
          >
            {t('customerDetail.setToZero')}
          </button>
          <button
            type="button"
            className="helper"
            onClick={() => { touchDate(); setInputValue(String(totalQty)) }}
            style={{ flex: 1 }}
          >
            {t('customerDetail.fullDelivery')}
          </button>
        </div>

        <div className="helper" style={{ marginBottom: 4 }}>
          {t('customerDetail.newStatus')}
        </div>
        <div style={{ marginBottom: 12 }}>
          {statusLabel}{totalQty > 0 && remaining !== 0 && t('customerDetail.partiallyDeliveredWithRemaining', { remaining })}
        </div>

        {clampedValue > 0 && (
          <>
            <div className="helper" style={{ marginBottom: 4 }}>
              {t('customerDetail.deliveryDate')}
            </div>
            <DateInput
              value={deliveredAt}
              onChange={setDeliveredAt}
              style={{ width: '100%', marginBottom: 12 }}
            />
          </>
        )}

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
            onClick={() => onSave(order.id, clampedValue, clampedValue > 0 ? deliveredAt : undefined)}
            disabled={saving}
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}







