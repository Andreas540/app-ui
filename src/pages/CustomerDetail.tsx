// src/pages/CustomerDetail.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchCustomerDetail, type CustomerDetail } from '../lib/api'
import { formatUSAny } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'
import PaymentDetailModal from '../components/PaymentDetailModal'

export default function CustomerDetailPage() {
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
        headers: { 'content-type': 'application/json' },
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

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>Error: {err}</p></div>
  if (!data) return null

  const { customer, totals, orders, payments } = data
  const addrLine1 = [customer.address1, customer.address2].filter(Boolean).join(', ')
  const addrLine2 = [customer.city, customer.state, customer.postal_code].filter(Boolean).join(' ')
  const isPartnerCustomer = customer.customer_type === 'Partner'

  // Show 5 by default
  const shownOrders   = showAllOrders   ? orders   : orders.slice(0, 5)
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

        <Link to="/customers" className="helper" style={{ whiteSpace:'nowrap' }}>
          &larr; Customers
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
            New order
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
            New payment
          </button>
        </Link>
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
                <div>{customer.customer_type}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="helper">Shipping cost</div>
                <div>{fmtMoney((customer as any).shipping_cost ?? 0)}</div>
              </div>

              {/* ✨ NEW: Company name */}
              <div style={{ marginTop: 12 }}>
                <div className="helper">Company name</div>
                <div>{customer.company_name || '—'}</div>
              </div>
              {/* ✨ END NEW */}

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
          <div style={{ fontWeight: 700 }}>{fmtMoney((totals as any).owed_to_me)}</div>
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
          <div style={{display:'grid'}}>
            {shownOrders.map(o => {
              // NOTE: server should provide product_name, qty, unit_price, partner_amount
              const middle =
                (o as any).product_name && (o as any).qty != null
                  ? `${(o as any).product_name} / ${Number((o as any).qty).toLocaleString('en-US')} / ${fmtMoney((o as any).unit_price ?? 0)}`
                  : `${o.lines} line(s)`

              const withPartner = isPartnerCustomer && (o as any).partner_amount != null
                ? `${middle} / ${fmtIntMoney((o as any).partner_amount)}`
                : middle

              const hasNotes = (o as any).notes && (o as any).notes.trim()

              return (
                <div
                  key={o.id}
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
                    {/* DATE (MM/DD/YY) */}
                    <div className="helper">{formatUSAny((o as any).order_date)}</div>

                                                            {/* DELIVERY STATUS ICON (tri-state) */}
                    <div
                      style={{
                        width: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {(() => {
                        const status =
                          (o as any).delivery_status ||
                          ((o as any).delivered ? 'delivered' : 'not_delivered')
                        const deliveredQty = (o as any).delivered_quantity ?? 0
                        const totalQty = (o as any).total_qty ?? (o as any).qty ?? 0

                        let symbol = '○'
                        let color = '#d1d5db'
                        let title = 'Not delivered'

                        if (status === 'delivered') {
                          symbol = '✓'
                          color = '#10b981'
                          title = 'Delivered in full'
                        } else if (status === 'partial') {
                          symbol = '◐'
                          color = '#f59e0b'
                          title = `Partially delivered (${deliveredQty}/${totalQty})`
                        }

                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeliveryIconClick(o)
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            title={title}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 16,
                                height: 16,
                                fontSize: 14,
                                lineHeight: 1,
                                color,
                              }}
                            >
                              {symbol}
                            </span>
                          </button>
                        )
                      })()}
                    </div>

                    {/* MIDDLE TEXT — compact like the date */}
                    <div 
                      className="helper"
                      onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ cursor: 'pointer', lineHeight: '1.4' }}
                    >
                      {withPartner}
                    </div>

                    {/* RIGHT TOTAL — show with 2 decimals */}
                    <div 
                      className="helper" 
                      onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{textAlign:'right', cursor: 'pointer'}}
                    >
                      {fmtMoney((o as any).total)}
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
                        onClick={() => handleOrderClick(o)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        style={{ cursor: 'pointer', lineHeight: '1.4' }}
                      >
                        {(o as any).notes}
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
                      {(p as any).payment_type}
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

  let statusLabel = 'Not delivered'
  if (clampedValue === 0) statusLabel = 'Not delivered'
  else if (clampedValue === totalQty) statusLabel = 'Delivered in full'
  else statusLabel = `Partially delivered (${clampedValue}/${totalQty})`

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
        <h4 style={{ marginTop: 0, marginBottom: 8 }}>Update delivery</h4>

        <div className="helper" style={{ marginBottom: 8 }}>
          Order #{(order as any).order_no ?? order.id}
        </div>

        <div className="helper" style={{ marginBottom: 4 }}>
          Ordered quantity
        </div>
        <div style={{ marginBottom: 8 }}>{totalQty}</div>

        <div className="helper" style={{ marginBottom: 4 }}>
          Delivered quantity
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
            Set to 0
          </button>
          <button
            type="button"
            className="helper"
            onClick={() => setInputValue(String(totalQty))}
            style={{ flex: 1 }}
          >
            Full delivery
          </button>
        </div>

        <div className="helper" style={{ marginBottom: 4 }}>
          New status
        </div>
        <div style={{ marginBottom: 12 }}>
          {statusLabel}{' '}
          {totalQty > 0 && remaining !== 0 && `(${remaining} remaining)`}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="helper"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onSave(order.id, clampedValue)}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}







