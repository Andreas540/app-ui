import { useEffect, useMemo, useState } from 'react'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'
import { formatUSAny } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Dashboard() {
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [partnerTotals, setPartnerTotals] = useState({ owed: 0, paid: 0, net: 0 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ordersErr, setOrdersErr] = useState<string | null>(null)
  const [orderDisplayCount, setOrderDisplayCount] = useState(5)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [orderFilter, setOrderFilter] = useState<'Most recent' | 'Not delivered'>('Most recent')
  
  // Load customers data for totals
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed()
        setCustomers(res.customers)
        // Get partner totals from API response
        if ((res as any).partner_totals) {
          setPartnerTotals((res as any).partner_totals)
        }
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Load recent orders data
  useEffect(() => {
    (async () => {
      try {
        setOrdersLoading(true); setOrdersErr(null)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const filterParam = orderFilter === 'Not delivered' ? '?filter=not-delivered' : ''
        const res = await fetch(`${base}/api/recent-orders${filterParam}`, { cache: 'no-store' })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load recent orders (status ${res.status}) ${text?.slice(0,140)}`)
        }
        const data = await res.json()
        setRecentOrders(data.orders)
        console.log('Recent orders loaded:', data.orders)
      } catch (e: any) {
        setOrdersErr(e?.message || String(e))
        console.error('Orders loading error:', e)
      } finally {
        setOrdersLoading(false)
      }
    })()
  }, [orderFilter])

  // Calculate total owed to me from database data
  const totalOwedToMe = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.owed_to_me || 0), 0),
    [customers]
  )

  // My $ = Total owed to me - Net owed to Partners (from API)
  const myDollars = useMemo(
    () => Math.max(0, Number(totalOwedToMe) - Number(partnerTotals.net)),
    [totalOwedToMe, partnerTotals.net]
  )

  // Show orders based on display count
  const shownOrders = recentOrders.slice(0, orderDisplayCount)

  // Compact layout constants (same as CustomerDetail)
  const DATE_COL = 55
  const LINE_GAP = 4

  // Handle delivery toggle for orders
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
      setRecentOrders(prev => 
        prev.map(order => 
          order.id === orderId 
            ? { ...order, delivered: newDeliveredStatus }
            : order
        )
      )
    } catch (e: any) {
      console.error('Failed to toggle delivery status:', e)
      alert(`Failed to update delivery status: ${e.message}`)
    }
  }

  const handleOrderClick = (order: any) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  // Determine title based on filter
  const ordersTitle = orderFilter === 'Not delivered' 
    ? 'Not delivered orders' 
    : 'Most recently registered orders'

  return (
    <div className="grid">
      <div className="card">        
        {loading ? (
          <div className="helper">Loading...</div>
        ) : err ? (
          <div style={{ color: 'salmon' }}>Error: {err}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Total owed to me */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Total owed to me</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(totalOwedToMe)}
              </div>
            </div>

            {/* Owed to partners */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Owed to partners</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(partnerTotals.net)}
              </div>
            </div>

            {/* My $ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
                marginTop: 4,
                paddingTop: 8,
                borderTop: '1px solid #eee'
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>My $</div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 20, color: 'var(--primary)' }}>
                {fmtIntMoney(myDollars)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        {/* Filter buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <button 
            className="primary" 
            onClick={() => {
              setOrderFilter('Most recent')
              setOrderDisplayCount(5)
            }}
            aria-pressed={orderFilter === 'Most recent'}
            style={{ height: 'calc(var(--control-h) * 0.67)' }}
          >
            Most recent
          </button>
          <button 
            className="primary" 
            onClick={() => {
              setOrderFilter('Not delivered')
              setOrderDisplayCount(5)
            }}
            aria-pressed={orderFilter === 'Not delivered'}
            style={{ height: 'calc(var(--control-h) * 0.67)' }}
          >
            Not delivered
          </button>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap: 8, alignItems:'center', marginTop: 12}}>
          <h3 style={{margin:0, fontSize: 16}}>{ordersTitle}</h3>
          {recentOrders.length > 5 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {orderDisplayCount > 5 && (
                <button
                  className="helper"
                  onClick={() => setOrderDisplayCount(5)}
                  style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
                >
                  Collapse
                </button>
              )}
              {orderDisplayCount < 15 && recentOrders.length > orderDisplayCount && (
                <button
                  className="helper"
                  onClick={() => setOrderDisplayCount(prev => prev + 5)}
                  style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
                >
                  Show 5 more
                </button>
              )}
            </div>
          )}
        </div>

        {ordersLoading ? (
          <p className="helper">Loading orders...</p>
        ) : ordersErr ? (
          <p style={{ color: 'salmon' }}>Error loading orders: {ordersErr}</p>
        ) : recentOrders.length === 0 ? (
          <p className="helper">No orders found.</p>
        ) : (
          <div style={{display:'grid', marginTop: 12}}>
            {shownOrders.map(o => {
              const detailsLine = o.product_name && o.qty != null
                ? `${o.product_name} / ${Number(o.qty).toLocaleString('en-US')} / $${Number(o.unit_price ?? 0).toFixed(2)}`
                : `${o.lines} line(s)`

              const hasNotes = o.notes && o.notes.trim()

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
                    <div className="helper">{formatUSAny(o.order_date)}</div>

                    {/* DELIVERY CHECKMARK */}
                    <div style={{ width: 20, textAlign: 'left', paddingLeft: 4 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeliveryToggle(o.id, !o.delivered)
                        }}
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 14
                        }}
                        title={`Mark as ${o.delivered ? 'undelivered' : 'delivered'}`}
                      >
                        {o.delivered ? (
                          <span style={{ color: '#10b981' }}>✓</span>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>○</span>
                        )}
                      </button>
                    </div>

                    {/* MIDDLE: Customer name + details */}
                    <div 
                      className="helper"
                      onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{ cursor: 'pointer', lineHeight: '1.4' }}
                    >
                      <div>
                        <strong>{o.customer_name}</strong>
                      </div>
                      <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>
                        {detailsLine}
                      </div>
                    </div>

                    {/* RIGHT TOTAL — with $ sign */}
                    <div 
                      className="helper" 
                      onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{textAlign:'right', cursor: 'pointer'}}
                    >
                      ${Math.round(Number(o.total)||0).toLocaleString('en-US')}
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

      <OrderDetailModal 
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
      />
    </div>
  )
}
