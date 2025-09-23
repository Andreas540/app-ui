import { useEffect, useMemo, useState } from 'react'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'
import { clearOrders } from '../lib/storage'

function fmtIntMoney(n: number) {
  return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
}

export default function Dashboard() {
  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ordersErr, setOrdersErr] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  
  // Load customers data for totals
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed()
        setCustomers(res.customers)
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
        const res = await fetch(`${base}/api/recent-orders`, { cache: 'no-store' })
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
  }, [])

  // Calculate totals from database data
  const totalOwedToMe = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.owed_to_me || 0), 0),
    [customers]
  )
  
  const totalOwedToPartners = useMemo(
    () => customers.reduce((sum, c) => sum + Number(c.owed_to_partners || 0), 0),
    [customers]
  )

  const myDollars = useMemo(
    () => Math.max(0, Number(totalOwedToMe) - Number(totalOwedToPartners)),
    [totalOwedToMe, totalOwedToPartners]
  )


  // Show 5 or 10 orders based on expand state
  const shownOrders = showAllOrders ? recentOrders.slice(0, 10) : recentOrders.slice(0, 5)

  // Compact layout constants (same as CustomerDetail)
  const DATE_COL = 65 // px
  const LINE_GAP = 4

  // Simple date formatter
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
  }

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
                {fmtIntMoney(totalOwedToPartners)}
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
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0}}>Most recently registered orders</h3>
          {recentOrders.length > 5 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {showAllOrders ? (
                <>
                  <button
                    className="helper"
                    onClick={() => setShowAllOrders(false)}
                    style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
                  >
                    Collapse
                  </button>
                  {recentOrders.length > 10 && (
                    <button
                      className="helper"
                      onClick={() => {/* TODO: implement loading more than 10 */}}
                      style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}
                    >
                      Show 5 more
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="helper"
                  onClick={() => setShowAllOrders(true)}
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
          <p className="helper">No orders yet.</p>
        ) : (
          <div style={{display:'grid', gap:10, marginTop: 12}}>
            {shownOrders.map(o => {
              const middle = o.product_name && o.qty != null
                ? `${o.product_name} / ${o.qty} / $${Number(o.unit_price ?? 0).toFixed(2)}`
                : `${o.lines} line(s)`

              return (
                <div
                  key={o.id}
                  style={{
                    display:'grid',
                    gridTemplateColumns:`${DATE_COL}px 1fr auto`,
                    gap:LINE_GAP,
                    borderBottom:'1px solid #eee',
                    padding:'8px 0'
                  }}
                >
                  {/* DATE (MM/DD/YY) */}
                  <div className="helper">{formatDate(o.order_date)}</div>

                  {/* MIDDLE TEXT */}
                  <div className="helper">{middle}</div>

                  {/* RIGHT TOTAL */}
                  <div className="helper" style={{textAlign:'right'}}>
                    {`$${Math.round(Number(o.total)||0).toLocaleString('en-US')}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Maintenance</h3>
        <button onClick={() => { if (confirm('Delete ALL saved orders?')) { clearOrders(); location.reload(); }}}>
          Clear saved orders
        </button>
        <p className="helper" style={{marginTop:8}}>Local-only; useful while prototyping.</p>
      </div>
    </div>
  )
}
