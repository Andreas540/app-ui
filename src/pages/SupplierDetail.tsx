// src/pages/SupplierDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { formatUSAny } from '../lib/time'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import SupplierOrderDetailModal from '../components/SupplierOrderDetailModal'
import PaymentDetailModal from '../components/PaymentDetailModal'

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
  delivered: boolean
  delivery_date?: string
  received: boolean
  received_date?: string
  in_customs: boolean
  in_customs_date?: string
  est_delivery_date?: string
}

interface Payment {
  id: string
  payment_date: string
  payment_type: string
  amount: number
  notes?: string | null
  order_no?: string | null
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
  payments: Payment[]
}

async function fetchSupplierDetail(id: string): Promise<SupplierDetail> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/supplier?id=${id}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch supplier (status ${res.status}) ${text?.slice(0,140)}`)
  }
  return res.json()
}

export default function SupplierDetailPage() {
  // --- Hooks (fixed, stable order) ---
  const { t } = useTranslation()
  const { user } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  const showOrderNumber = config.ui.showOrderNumberInList
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<SupplierDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

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

  const handlePaymentClick = (payment: Payment) => {
    setSelectedPayment(payment)
    setShowPaymentModal(true)
  }

  if (loading) return <div className="card"><p>{t('loading')}</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>{t('error')} {err}</p></div>
  if (!data) return null

  const { supplier, totals, orders, payments } = data
  const addrLine1 = [supplier.address1, supplier.address2].filter(Boolean).join(', ')
  const addrLine2 = [supplier.city, supplier.state, supplier.postal_code].filter(Boolean).join(' ')

  // Compute total paid per order from payments list
  const paidByOrderId: Record<string, number> = {}
  for (const p of payments) {
    const oid = (p as any).order_id
    if (oid) paidByOrderId[oid] = (paidByOrderId[oid] || 0) + Number(p.amount)
  }

  // Show 5 by default
  const shownOrders = showAllOrders ? orders : orders.slice(0, 5)
  const shownPayments = showAllPayments ? payments : payments.slice(0, 5)

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
            title={t('suppliers.editTitle')}
            aria-label={t('suppliers.editTitle')}
            style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1, borderRadius: 6 }}
          >
            ✎
          </Link>
        </div>

        <Link to="/suppliers" className="helper" style={{ whiteSpace:'nowrap' }}>
          {t('suppliers.backToSuppliers')}
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
            {t('newOrder')}
          </button>
        </Link>

        <Link
          to={`/payments?supplier_id=${supplier.id}&supplier_name=${encodeURIComponent(supplier.name)}&return_to=supplier&return_id=${supplier.id}`}
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
            {t('newPayment')}
          </button>
        </Link>
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

              <div style={{ marginTop: 12 }}>
                <div className="helper">{t('phone')}</div>
                <div>{supplier.phone ? <a href={phoneHref(supplier.phone)}>{supplier.phone}</a> : '—'}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">{t('address')}</div>
                <div>
                  {addrLine1 || '—'}{addrLine1 && <br/>}{addrLine2}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ textAlign:'right' }}>
          <div className="helper">{t('suppliers.owedToSupplier')}</div>
          <div style={{ fontWeight: 700 }}>{fmtIntMoney(totals.owed_to_supplier)}</div>
        </div>
      </div>

      {/* Orders with supplier */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>{t('suppliers.ordersWithSupplier')}</h4>
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
              const hasNotes = o.notes && o.notes.trim()
              const totalShippingCost = o.items.reduce((sum, item) => sum + Number(item.shipping_total || 0), 0)

              // Determine status badge
              let statusBadge = null
              if (o.received && o.received_date) {
                statusBadge = (
                  <span style={{
                    backgroundColor: '#22c55e',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap'
                  }}>
                    {t('suppliers.receivedLabel')} {formatUSAny(o.received_date)}
                  </span>
                )
              } else if (o.in_customs && o.in_customs_date) {
                statusBadge = (
                  <span style={{
                    backgroundColor: '#f97316',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap'
                  }}>
                    {t('suppliers.inCustomsLabel')} {formatUSAny(o.in_customs_date)}
                  </span>
                )
              } else if (o.delivered && o.delivery_date) {
                statusBadge = (
                  <span style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap'
                  }}>
                    {t('delivered')}: {formatUSAny(o.delivery_date)}
                  </span>
                )
              } else if (o.est_delivery_date) {
                statusBadge = (
                  <span className="helper" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {t('suppliers.estDelivery')} {formatUSAny(o.est_delivery_date)}
                  </span>
                )
              }

              return (
                <div
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  style={{
                    borderBottom:'1px solid #eee',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {/* First row: Date + Order number + Status + Total */}
                  <div
                    style={{
                      display:'grid',
                      gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                      gap:LINE_GAP,
                      alignItems: 'center'
                    }}
                  >
                    {/* DATE (MM/DD/YY) */}
                    <div className="helper">{formatUSAny(o.order_date)}</div>

                    {/* EMPTY COLUMN for alignment */}
                    <div></div>

                    {/* ORDER NUMBER + STATUS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: '1.4' }}>
                      <span className="helper">#{o.order_no}</span>
                      {statusBadge}
                    </div>

                    {/* TOTAL COST */}
                    {(() => {
                      const orderTotal = Number(o.total) || 0
                      const paid = paidByOrderId[o.id] || 0
                      const orderColor = paid >= orderTotal && orderTotal > 0
                        ? '#10b981'
                        : paid > 0 && paid < orderTotal
                          ? '#f59e0b'
                          : undefined
                      return (
                        <div className="helper" style={{ textAlign: 'right', color: orderColor }}>
                          {fmtMoney(orderTotal)}
                        </div>
                      )
                    })()}
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
                        {t('supplierOrderModal.shippingCost')}
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

      {/* Payments to supplier */}
      <div style={{ marginTop: 20 }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h4 style={{margin:0}}>{t('suppliers.paymentsToSupplier')}</h4>
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
              const hasNotes = p.notes && p.notes.trim()
              const isAddToDebt = (p.payment_type || '').toLowerCase() === 'add to debt'

              // Amount display: "-$..." for payments, "+$..." (no minus) for Add to debt
              const amountStr = isAddToDebt
                ? fmtMoney(Math.abs(p.amount))
                : `-${fmtMoney(Math.abs(p.amount))}`

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
                    <div className="helper">{formatUSAny(p.payment_date)}</div>

                    {/* EMPTY COLUMN for alignment */}
                    <div></div>

                    {/* TYPE */}
                    <div
                      className="helper"
                      onClick={() => handlePaymentClick(p)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ lineHeight: '1.4', cursor: 'pointer' }}
                    >
                      <div>{p.payment_type}</div>
                      {showOrderNumber && p.order_no && (
                        <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>#{p.order_no}</div>
                      )}
                    </div>

                    {/* AMOUNT: "-$..." except Add to debt */}
                    <div 
                      className="helper" 
                      onClick={() => handlePaymentClick(p)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{textAlign:'right', cursor: 'pointer'}}
                    >
                      {amountStr}
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
                        style={{ lineHeight: '1.4', cursor: 'pointer' }}
                      >
                        {p.notes}
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

      {/* Order Modal */}
      <SupplierOrderDetailModal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        supplierName={supplier.name}
      />

      {/* Payment Modal */}
      <PaymentDetailModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        payment={selectedPayment}
        isSupplierPayment={true}
      />
    </div>
  )
}