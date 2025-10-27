import { useEffect, useMemo, useState } from 'react'
import { listCustomersWithOwed, type CustomerWithOwed } from '../lib/api'
import { formatUSAny } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'

// --- Money format helpers (with correct minus placement) ---
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

// --- Chart label helpers ---
const fmtK1 = (n: number) => `${(n / 1000).toFixed(1)}K`
const fmtPct1 = (n: number) => `${(n * 100).toFixed(1)}%`

type MonthlyPoint = {
  month: string // "YYYY-MM"
  revenue: number
  profit: number
  profitPct: number // 0..1
}

// Fixed-but-responsive height: shorter on phones, taller on desktop
const CHART_HEIGHT_CSS = 'clamp(260px, 40vh, 420px)'

// ---- FETCH & NORMALIZE MONTHLY DATA ----
async function fetchMonthly3(): Promise<MonthlyPoint[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/metrics/monthly?months=3`, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load monthly metrics (status ${res.status}) ${text?.slice(0,140)}`)
  }
  const data = await res.json()
  const rows = Array.isArray(data?.rows) ? data.rows : []

  // Normalize possible key variants and types:
  return rows.map((r: any) => {
    const month = String(r.month ?? '')
    const revenue = Number(r.revenue ?? 0)
    const profit = Number(r.profit ?? 0)
    const profitPctRaw = r.profitPct ?? r.profit_pct ?? r.profitpercent ?? 0
    const profitPct = Number(profitPctRaw) || 0
    return { month, revenue, profit, profitPct }
  }) as MonthlyPoint[]
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

  // JJ Boston's net (to exclude from partner totals)
  const [jjNet, setJjNet] = useState<number | null>(null)

  // Monthly metrics for the chart (last 3 months)
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const [monthlyErr, setMonthlyErr] = useState<string | null>(null)
  const [monthlyFirstLoad, setMonthlyFirstLoad] = useState(true)

  // Load customers data for totals
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const res = await listCustomersWithOwed()
        setCustomers(res.customers)
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

  // Load JJ Boston partner net and exclude it from partner totals
  useEffect(() => {
    (async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const bootRes = await fetch(`${base}/api/bootstrap`, { cache: 'no-store' })
        if (!bootRes.ok) throw new Error('Failed to load partners')
        const boot = await bootRes.json()
        const partners: Array<{ id: string; name: string }> = boot.partners ?? []
        const jj = partners.find(p => (p.name || '').trim().toLowerCase() === 'jj boston')
        if (!jj) { setJjNet(0); return }
        const res = await fetch(`${base}/api/partner?id=${encodeURIComponent(jj.id)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load JJ Boston totals')
        const data = await res.json()
        const net = Number(data?.totals?.net_owed ?? 0)
        setJjNet(Number.isFinite(net) ? net : 0)
      } catch {
        setJjNet(0)
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
      } catch (e: any) {
        setOrdersErr(e?.message || String(e))
      } finally {
        setOrdersLoading(false)
      }
    })()
  }, [orderFilter])

  // Initial monthly load (show loading only this time)
  useEffect(() => {
    let stop = false
    const initial = async () => {
      try {
        setMonthlyLoading(true); setMonthlyErr(null)
        const rows = await fetchMonthly3()
        if (!stop) setMonthly(rows)
      } catch (e: any) {
        if (!stop) setMonthlyErr(e?.message || String(e))
      } finally {
        if (!stop) { setMonthlyLoading(false); setMonthlyFirstLoad(false) }
      }
    }
    initial()
    return () => { stop = true }
  }, [])

  // Silent polling every 30s (skip when tab hidden)
  useEffect(() => {
    let stop = false
    const loadSilent = async () => {
      try {
        if (document.visibilityState !== 'visible') return
        const rows = await fetchMonthly3()
        if (!stop) setMonthly(rows)
      } catch {
        // swallow silent errors
      }
    }
    const id = setInterval(loadSilent, 30_000)
    const onVis = () => { if (document.visibilityState === 'visible') loadSilent() }
    window.addEventListener('visibilitychange', onVis)
    return () => { stop = true; clearInterval(id); window.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Also refresh monthly when the orders list length changes (new orders registered)
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchMonthly3()
        setMonthly(rows)
      } catch {}
    })()
  }, [recentOrders.length])

  // Total owed to me: sum positives only (treat negatives as 0)
  const totalOwedToMe = useMemo(
    () =>
      customers.reduce((sum, c) => {
        const n = Number(c.owed_to_me || 0)
        return sum + Math.max(0, n)
      }, 0),
    [customers]
  )

  // Owed to partners excluding JJ Boston
  const owedToPartnersExJJ = useMemo(() => {
    const net = Number(partnerTotals.net) || 0
    const jj = Number(jjNet) || 0
    const adjusted = net - jj
    return adjusted < 0 ? 0 : adjusted
  }, [partnerTotals.net, jjNet])

  // My $
  const myDollars = useMemo(
    () => Math.max(0, Number(totalOwedToMe) - Number(owedToPartnersExJJ)),
    [totalOwedToMe, owedToPartnersExJJ]
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
      
      setRecentOrders(prev => 
        prev.map(order => 
          order.id === orderId 
            ? { ...order, delivered: newDeliveredStatus }
            : order
        )
      )
    } catch (e: any) {
      alert(`Failed to update delivery status: ${e.message}`)
    }
  }

  const handleOrderClick = (order: any) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  const ordersTitle =
    orderFilter === 'Not delivered'
      ? 'Not delivered orders'
      : 'Most recently registered orders'

  return (
    <div className="grid">
      {/* -------- Card 1: Totals -------- */}
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

            {/* Owed to partners (excluding JJ Boston) */}
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
                {fmtIntMoney(owedToPartnersExJJ)}
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

      {/* -------- Card 2: Chart (responsive height, zero interaction) -------- */}
      <div className="card" style={{ height: CHART_HEIGHT_CSS, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Revenue & Profit (last 3 months)</h3>
          {/* Show loading only on first load to avoid flicker */}
          {monthlyFirstLoad && monthlyLoading && <span className="helper">Loading…</span>}
          {monthlyErr && <span style={{ color: 'salmon' }}>{monthlyErr}</span>}
        </div>

        {/* pointerEvents: 'none' = no hover/click/focus interactions */}
        <div style={{ flex: 1, minHeight: 180, outline: 'none', pointerEvents: 'none' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
              {/* No grid/legend/tooltip */}

              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
                tickLine={false}
                tickFormatter={(m) => {
                  const [y, mm] = (m || '').split('-').map(Number)
                  if (!y || !mm) return String(m || '')
                  const d = new Date(y, mm - 1, 1)
                  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
                }}
              />
              {/* Left axis = $, hidden ticks; add 10% headroom */}
              <YAxis
                yAxisId="left"
                tick={false}
                axisLine={false}
                width={0}
                domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.1)]}
              />
              {/* Right axis = %, fixed 0..45% */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={false}
                axisLine={false}
                width={0}
                domain={[0, 0.45]}
              />

              {/* Bars: darker orange + light blue; labels on top; NO animations; 50% wider */}
              <Bar yAxisId="left" dataKey="revenue" fill="#f59e0b" isAnimationActive={false} barSize={33}>
                <LabelList
                  dataKey="revenue"
                  position="top"
                  offset={12}
                  formatter={(v: any) => `$${fmtK1(Number(v))}`}
                  fill="#fff"
                  style={{ fontSize: 12, fontWeight: 700 }}
                />
              </Bar>
              <Bar yAxisId="left" dataKey="profit" fill="#60a5fa" isAnimationActive={false} barSize={33}>
                <LabelList
                  dataKey="profit"
                  position="top"
                  offset={12}
                  formatter={(v: any) => `$${fmtK1(Number(v))}`}
                  fill="#fff"
                  style={{ fontSize: 12, fontWeight: 700 }}
                />
              </Bar>

              {/* Profit % line on right axis, labels styled like bars */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="profitPct"
                stroke="#374151"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="profitPct"
                  position="top"
                  offset={12}
                  formatter={(v: any) => fmtPct1(Number(v))}
                  fill="#fff"
                  style={{ fontSize: 12, fontWeight: 700 }}
                />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* -------- Card 3: Orders -------- */}
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
                ? `${o.product_name} / ${Number(o.qty).toLocaleString('en-US')} / ${fmtMoney(o.unit_price ?? 0)}`
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

                    {/* RIGHT TOTAL — with $ sign and correct minus placement */}
                    <div 
                      className="helper" 
                      onClick={() => handleOrderClick(o)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      style={{textAlign:'right', cursor: 'pointer'}}
                    >
                      {fmtIntMoney(o.total)}
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













