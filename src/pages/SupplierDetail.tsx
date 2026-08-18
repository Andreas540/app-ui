// src/pages/SupplierDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { formatDate } from '../lib/time'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import SupplierOrderDetailModal from '../components/SupplierOrderDetailModal'
import SupplierOrderStagesModal from '../components/SupplierOrderStagesModal'
import PaymentDetailModal from '../components/PaymentDetailModal'
import { useCurrency } from '../lib/useCurrency'

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
  id: string
  order_id: string
  product_name: string
  qty: number
  qty_shipped: number
  qty_in_customs: number
  qty_received: number
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
  derived_status?: 'received' | 'in_customs' | 'shipped' | 'partial' | 'mixed' | 'pending'
  paid_amount?: number
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
  const [stagesOrder, setStagesOrder] = useState<Order | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  const loadData = async () => {
    try {
      if (!id) { setErr('Missing id'); setLoading(false); return }
      setErr(null)
      const d = await fetchSupplierDetail(id)
      setData(d)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [id])

  const { fmtMoney, fmtIntMoney, fmtNumber } = useCurrency()

  function deriveItemStatus(item: OrderItem): 'pending' | 'shipped' | 'in_customs' | 'received' | 'partial' {
    const qty      = Number(item.qty)            || 0
    const received = Number(item.qty_received)   || 0
    const customs  = Number(item.qty_in_customs) || 0
    const shipped  = Number(item.qty_shipped)    || 0
    if (qty === 0) return 'pending'
    if (received >= qty) return 'received'   // ✓ green — fully received
    if (received > 0)    return 'partial'    // ◐ amber — partially received
    if (customs  > 0)    return 'in_customs' // ◑ orange — most advanced stage present
    if (shipped  > 0)    return 'shipped'    // ► blue
    return 'pending'                          // ○ grey
  }

  function itemStageIcon(item: OrderItem, onClick?: (e: React.MouseEvent) => void) {
    const ds = deriveItemStatus(item)
    let symbol = '', color = '#d1d5db'
    if (ds === 'received')        { symbol = '✓'; color = '#10b981' }
    else if (ds === 'partial')    { symbol = '◐'; color = '#f59e0b' }
    else if (ds === 'in_customs') { symbol = '◑'; color = '#f97316' }
    else if (ds === 'shipped')    { symbol = '►'; color = '#3b82f6' }
    const inner = ds === 'pending'
      ? <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${color}` }} />
      : <span style={{ fontSize: 11, lineHeight: 1, color }}>{symbol}</span>
    return (
      <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {onClick
          ? <button onClick={onClick} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>{inner}</button>
          : inner
        }
      </div>
    )
  }

  function phoneHref(p?: string) {
    const s = (p || '').replace(/[^\d+]/g, '')
    return s ? `tel:${s}` : undefined
  }

  const handlePaymentClick = (payment: Payment) => {
    setSelectedPayment(payment)
    setShowPaymentModal(true)
  }

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{color:'var(--color-error)'}}>{t('error')} {err}</p></div>
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
    <div className="card page-normal" style={{paddingBottom: 12}}>
      {/* Header row: Name + Edit link */}
      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth: 0 }}>
        <h3 style={{ margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {supplier.name}
        </h3>
        <Link
          to={`/suppliers/${supplier.id}/edit`}
          className="helper"
          style={{ whiteSpace:'nowrap', textDecoration:'none', color:'var(--accent)' }}
        >
          {t('edit')}
        </Link>
      </div>

      {/* Action row under name: New order + New payment */}
      <div style={{ display:'flex', gap:8, marginTop: 12 }}>
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

      {/* Total owed to supplier */}
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('suppliers.owedToSupplier')}</div>
        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{fmtIntMoney(totals.owed_to_supplier)}</div>
      </div>
      <div style={{ borderTop: '1px solid var(--separator)', margin: '16px 0' }} />

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
              const ds = o.derived_status || 'pending'

              // Stage icon — same pattern as CustomerDetail delivery icon
              const stageIcon = (() => {
                let symbol = '', color = '#d1d5db', title = t('suppliers.stagePending')
                if (ds === 'received')        { symbol = '✓'; color = '#10b981'; title = t('suppliers.stageReceived') }
                else if (ds === 'partial')    { symbol = '◐'; color = '#f59e0b'; title = t('suppliers.statusPartial') }
                else if (ds === 'mixed')      { symbol = '⊕'; color = '#8b5cf6'; title = t('suppliers.statusMixed') }
                else if (ds === 'in_customs') { symbol = '◑'; color = '#f97316'; title = t('suppliers.stageInCustoms') }
                else if (ds === 'shipped')    { symbol = '►'; color = '#3b82f6'; title = t('suppliers.stageShipped') }
                return (
                  <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'start' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setStagesOrder(o) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                      title={title}
                    >
                      {ds === 'pending'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                            <span style={{ display: 'inline-block', width: 13, height: 13, borderRadius: '50%', border: `1.5px solid ${color}` }} />
                          </span>
                        : ds === 'mixed'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="7" stroke="#8b5cf6" strokeWidth="1.5"/>
                              <path d="M8 8 L8 1 A7 7 0 0 1 15 8 Z" fill="#8b5cf6"/>
                              <path d="M8 8 L8 15 A7 7 0 0 1 1 8 Z" fill="#8b5cf6"/>
                            </svg>
                          </span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, fontSize: 16, lineHeight: 1, color }}>{symbol}</span>
                      }
                    </button>
                  </div>
                )
              })()

              // Status badge driven by derived_status
              let statusBadge = null
              if (ds === 'received') {
                statusBadge = (
                  <span style={{ backgroundColor: '#22c55e', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t('suppliers.receivedLabel')}{o.received_date ? ` ${formatDate(o.received_date)}` : ''}
                  </span>
                )
              } else if (ds === 'partial') {
                statusBadge = (
                  <span style={{ backgroundColor: '#f59e0b', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t('suppliers.statusPartial')}
                  </span>
                )
              } else if (ds === 'mixed') {
                statusBadge = (
                  <span style={{ backgroundColor: '#8b5cf6', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t('suppliers.statusMixed')}
                  </span>
                )
              } else if (ds === 'in_customs') {
                statusBadge = (
                  <span style={{ backgroundColor: '#f97316', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t('suppliers.inCustomsLabel')}{o.in_customs_date ? ` ${formatDate(o.in_customs_date)}` : ''}
                  </span>
                )
              } else if (ds === 'shipped') {
                statusBadge = (
                  <span style={{ backgroundColor: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t('shipped')}{o.delivery_date ? `: ${formatDate(o.delivery_date)}` : ''}
                  </span>
                )
              } else if (o.est_delivery_date) {
                statusBadge = (
                  <span className="helper" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {t('suppliers.estDelivery')} {formatDate(o.est_delivery_date)}
                  </span>
                )
              }

              return (
                <div
                  key={o.id}
                  onClick={() => setSelectedOrder({ ...o, paid_amount: paidByOrderId[o.id] || 0 })}
                  style={{
                    borderBottom:'1px solid var(--line)',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {/* First row: Date + Stage icon + Order number + Status + Total */}
                  <div
                    style={{
                      display:'grid',
                      gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                      columnGap: 8,
                      rowGap: LINE_GAP,
                      alignItems: 'center'
                    }}
                  >
                    {/* DATE (MM/DD/YY) */}
                    <div className="helper">{formatDate(o.order_date)}</div>

                    {/* STAGE ICON */}
                    {stageIcon}

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
                        columnGap: 8,
                        rowGap: LINE_GAP,
                        marginTop: 4
                      }}
                    >
                      <div></div>
                      {itemStageIcon(item, (e) => { e.stopPropagation(); setStagesOrder(o) })}
                      <div className="helper" style={{ lineHeight: '1.4' }}>
                        {item.product_name} / {fmtNumber(item.qty)} / {fmtMoney(item.product_cost)}
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
                        columnGap: 8,
                        rowGap: LINE_GAP,
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
                        columnGap: 8,
                        rowGap: LINE_GAP,
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
                    borderBottom:'1px solid var(--line)',
                    paddingTop: '12px',
                    paddingBottom: '12px'
                  }}
                >
                  <div
                    style={{
                      display:'grid',
                      gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                      columnGap: 8,
                      rowGap: LINE_GAP,
                    }}
                  >
                    {/* DATE */}
                    <div className="helper">{formatDate(p.payment_date)}</div>

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
                        columnGap: 8,
                        rowGap: LINE_GAP,
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

      {/* Order Detail Modal */}
      <SupplierOrderDetailModal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        supplierName={supplier.name}
      />

      {/* Stage Quantities Modal */}
      <SupplierOrderStagesModal
        isOpen={!!stagesOrder}
        onClose={() => setStagesOrder(null)}
        order={stagesOrder}
        onSaved={() => loadData()}
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