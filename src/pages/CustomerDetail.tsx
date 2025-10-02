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
  function fmtMoney(n:number) { return `$${(Number(n) || 0).toFixed(2)}` }
  function fmtIntMoney(n:number) { return `$${Math.round(Number(n)||0).toLocaleString('en-US')}` }
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

  const handleDeliveryToggle = async (orderId: string, newDeliveredStatus: boolean) => {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/orders-delivery`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          order_id: orderId, 
          delivered: newDeliveredStatus 
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to update delivery status (status ${res.status}) ${text?.slice(0,140)}`)
      }
      
      // Update the local state to reflect the change immediately
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          orders: prev.orders.map(order => 
            order.id === orderId 
              ? { ...order, delivered: newDeliveredStatus }
              : order
          )
        }
      })
    } catch (e: any) {
      console.error('Failed to toggle delivery status:', e)
      alert(`Failed to update delivery status: ${e.message}`)
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
              width: 140,           // equal width
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
              width: 140,           // equal width; wide enough for full label
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
              // NOTE: server should provide product_name, qty, unit_price, partner_amount
              const middle =
                (o as any).product_name && (o as any).qty != null
                  ? `${(o as any).product_name} / ${(o as any).qty} / $${Number((o as any).unit_price ?? 0).toFixed(2)}`
                  : `${o.lines} line(s)`

              const withPartner = isPartnerCustomer && (o as any).partner_amount != null
                ? `${middle} / $${Math.round(Number((o as any).partner_amount))}`
                : middle

              return (
                <div
                  key={o.id}
                  style={{
                    display:'grid',
                    gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                    gap:LINE_GAP,
                    borderBottom:'1px solid #eee',
                    padding:'8px 0'
                  }}
                >
                  {/* DATE (MM/DD/YY) */}
                  <div className="helper">{formatUSAny((o as any).order_date)}</div>

                  {/* DELIVERY CHECKMARK - moved to column 2 */}
                  <div style={{ width: 20, textAlign: 'left', paddingLeft: 4 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeliveryToggle(o.id, !(o as any).delivered)
                      }}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 14
                      }}
                      title={`Mark as ${(o as any).delivered ? 'undelivered' : 'delivered'}`}
                    >
                      {(o as any).delivered ? (
                        <span style={{ color: '#10b981' }}>✓</span>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>○</span>
                      )}
                    </button>
                  </div>

                  {/* MIDDLE TEXT — compact like the date */}
                  <div 
                    className="helper"
                    onClick={() => handleOrderClick(o)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{ cursor: 'pointer' }}
                  >
                    {withPartner}
                  </div>

                  {/* RIGHT TOTAL — with $ sign */}
                  <div 
                    className="helper" 
                    onClick={() => handleOrderClick(o)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    style={{textAlign:'right', cursor: 'pointer'}}
                  >
                    {`${Math.round(Number((o as any).total)||0).toLocaleString('en-US')}`}
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
                  gridTemplateColumns:`${DATE_COL}px 20px 1fr auto`,
                  gap:LINE_GAP,
                  borderBottom:'1px solid #eee',
                  padding:'8px 0'
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
                  style={{ cursor: 'pointer' }}
                >
                  {(p as any).payment_type}
                </div>

                {/* AMOUNT with minus sign */}
                <div 
                  className="helper" 
                  onClick={() => handlePaymentClick(p)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  style={{textAlign:'right', cursor: 'pointer'}}
                >
                  {`-${Math.round(Number((p as any).amount)||0).toLocaleString('en-US')}`}
                </div>
              </div>
            ))}
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
    </div>
  )
}
