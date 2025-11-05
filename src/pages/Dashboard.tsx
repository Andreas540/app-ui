import { useEffect, useMemo, useRef, useState } from 'react'
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

// Fixed-but-responsive height: shorter on phones, taller on desktop
const CHART_HEIGHT_CSS = 'clamp(260px, 40vh, 420px)'

type MonthlyPoint = {
  month: string // "YYYY-MM"
  revenue: number
  profit: number
  profitPct: number // 0..1
}

type RpsPoint = {
  month: string            // "YYYY-MM"
  revenue: number          // from revenue_amount in the view
  operating_profit: number
  operatingPct: number     // operating_profit / revenue
  surplus: number
  surplusPct: number       // surplus / revenue
}

// ---- FETCH & NORMALIZE: existing graph (kept as-is) ----
async function fetchMonthly3(): Promise<MonthlyPoint[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/metrics/monthly?months=3`, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load monthly metrics (status ${res.status}) ${text?.slice(0,140)}`)
  }
  const data = await res.json()
  const rows = Array.isArray(data?.rows) ? data.rows : []

  // Normalize and compute % client-side for truth
  return rows.map((r: any) => {
    const month = String(r.month ?? '')
    const revenue = Number(r.revenue ?? 0)
    const profit = Number(r.profit ?? 0)
    const profitPct = revenue > 0 ? profit / revenue : 0
    return { month, revenue, profit, profitPct }
  }) as MonthlyPoint[]
}

// --- NEW: RPS monthly fetch (for Operating profit & Surplus slides) ---
async function fetchRpsMonthly(months = 3): Promise<RpsPoint[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/rps/monthly?months=${months}`, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load RPS monthly (status ${res.status}) ${text?.slice(0,140)}`)
  }
  const { rows } = await res.json()
  const safe = Array.isArray(rows) ? rows : []

  return safe.map((r: any) => {
    const revenue = Number(r.revenue ?? 0)
    const operating_profit = Number(r.operating_profit ?? 0)
    const surplus = Number(r.surplus ?? 0)
    const operatingPct = revenue > 0 ? operating_profit / revenue : 0
    const surplusPct = revenue > 0 ? surplus / revenue : 0

    return { 
      month: String(r.month ?? ''), 
      revenue, 
      operating_profit, 
      operatingPct, 
      surplus, 
      surplusPct 
    }
  })
}

// --- Reusable chart slide (FIXED: no duplicate title) ---
type SlideSpec = {
  title: string
  data: any[]
  bar1Key: string      // revenue key
  bar2Key: string      // second bar (profit / op / surplus)
  lineKey: string      // percent key
  computePct?: (row: any) => number
}

type ChartSlideProps = Omit<SlideSpec, 'title'>

function ChartSlide({
  data,
  bar1Key,
  bar2Key,
  lineKey,
  computePct,
}: ChartSlideProps) {
  const enriched = useMemo(() => {
    if (!computePct) return data
    return (data || []).map((r: any) => ({
      ...r,
      [lineKey]: computePct(r)
    }))
  }, [data, computePct, lineKey])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* pointerEvents: 'none' = no hover/click/focus interactions */}
      <div style={{ flex: 1, minHeight: 180, outline: 'none', pointerEvents: 'none' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={enriched} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
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

            {/* Bars: orange (revenue) + light blue (2nd series); labels; NO animations */}
            <Bar yAxisId="left" dataKey={bar1Key} fill="#f59e0b" isAnimationActive={false} barSize={33}>
              <LabelList
                dataKey={bar1Key}
                position="top"
                offset={12}
                formatter={(v: any) => `$${fmtK1(Number(v))}`}
                fill="#fff"
                style={{ fontSize: 12, fontWeight: 700 }}
              />
            </Bar>

            <Bar yAxisId="left" dataKey={bar2Key} fill="#60a5fa" isAnimationActive={false} barSize={33}>
              <LabelList
                dataKey={bar2Key}
                position="top"
                offset={12}
                formatter={(v: any) => `$${fmtK1(Number(v))}`}
                fill="#fff"
                style={{ fontSize: 12, fontWeight: 700 }}
              />
            </Bar>

            {/* Percent line on right axis */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={lineKey}
              stroke="#374151"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={lineKey}
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
  )
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

  // Slide index for manual carousel
  const [slide, setSlide] = useState<0 | 1 | 2>(0)
  const touchStartX = useRef<number | null>(null)

  // Monthly metrics for slide #1 (existing source)
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const [monthlyErr, setMonthlyErr] = useState<string | null>(null)

  // RPS data for slides #2 and #3
  const [rpsMonthly, setRpsMonthly] = useState<RpsPoint[]>([])
  const [rpsLoading, setRpsLoading] = useState(true)
  const [rpsErr, setRpsErr] = useState<string | null>(null)

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

  // Initial monthly load (slide #1)
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
        if (!stop) setMonthlyLoading(false)
      }
    }
    initial()
    return () => { stop = true }
  }, [])

  // Initial RPS load (slides #2, #3)
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        setRpsLoading(true); setRpsErr(null)
        const rows = await fetchRpsMonthly(3)
        if (!stop) setRpsMonthly(rows)
      } catch (e: any) {
        if (!stop) setRpsErr(e?.message || String(e))
      } finally {
        if (!stop) setRpsLoading(false)
      }
    }
    load()
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
        const rpsRows = await fetchRpsMonthly(3)
        if (!stop) setRpsMonthly(rpsRows)
      } catch {
        // swallow silent errors
      }
    }
    const id = setInterval(loadSilent, 30_000)
    const onVis = () => { if (document.visibilityState === 'visible') loadSilent() }
    window.addEventListener('visibilitychange', onVis)
    return () => { stop = true; clearInterval(id); window.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Also refresh charts when the orders list length changes (new orders registered)
  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchMonthly3()
        setMonthly(rows)
        const rpsRows = await fetchRpsMonthly(3)
        setRpsMonthly(rpsRows)
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

  // --- Carousel interactions ---
  function next() { setSlide(s => (s === 2 ? 0 : ((s + 1) as 0 | 1 | 2))) }
  function prev() { setSlide(s => (s === 0 ? 2 : ((s - 1) as 0 | 1 | 2))) }

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const startX = touchStartX.current
    touchStartX.current = null
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    const dx = endX - startX
    if (Math.abs(dx) > 40) {
      if (dx < 0) next() // swipe left shows next slide
      else prev()
    }
  }

  // Build slide specs
  const slide1: SlideSpec = {
    title: 'Revenue & Gross profit',
    data: monthly,
    bar1Key: 'revenue',
    bar2Key: 'profit',
    lineKey: 'profitPct',
  }

  const slide2: SlideSpec = {
    title: 'Revenue & Operating profit',
    data: rpsMonthly,
    bar1Key: 'revenue',
    bar2Key: 'operating_profit',
    lineKey: 'operatingPct',
  }

  const slide3: SlideSpec = {
    title: 'Revenue & Surplus',
    data: rpsMonthly,
    bar1Key: 'revenue',
    bar2Key: 'surplus',
    lineKey: 'surplusPct',
  }

  const slides = [slide1, slide2, slide3]

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

      {/* -------- Card 2: Chart Carousel -------- */}
      <div
        className="card"
        style={{ height: CHART_HEIGHT_CSS, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header: title + slide controls + loading/errors */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', marginBottom: 6, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {slides[slide].title}
          </h3>

          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {/* Loading badges */}
            {slide === 0 && monthlyLoading && <span className="helper">Loading…</span>}
            {slide === 0 && monthlyErr && <span style={{ color: 'salmon' }}>{monthlyErr}</span>}
            {slide > 0 && rpsLoading && <span className="helper">Loading…</span>}
            {slide > 0 && rpsErr && <span style={{ color: 'salmon' }}>{rpsErr}</span>}

            {/* Prev / Next buttons (desktop) */}
            <div style={{ display:'flex', gap:4 }}>
              <button className="helper" onClick={prev} title="Previous" style={{ padding:'4px 8px' }}>{'‹'}</button>
              <button className="helper" onClick={next} title="Next" style={{ padding:'4px 8px' }}>{'›'}</button>
            </div>
          </div>
        </div>

        {/* Slides strip */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            width: '300%',
            transform: `translateX(-${slide * 33.3333}%)`,
            transition: 'transform 220ms ease',
          }}
        >
          <div style={{ width:'100%', paddingRight: 8 }}>
            <ChartSlide {...slides[0]} />
          </div>
          <div style={{ width:'100%', paddingRight: 8 }}>
            <ChartSlide {...slides[1]} />
          </div>
          <div style={{ width:'100%' }}>
            <ChartSlide {...slides[2]} />
          </div>
        </div>

        {/* Dots */}
        <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:8 }}>
          {[0,1,2].map(i => (
            <button
              key={i}
              onClick={() => setSlide(i as 0|1|2)}
              aria-pressed={slide===i}
              style={{
                width: 8, height: 8, borderRadius: 8,
                border: 'none',
                background: slide===i ? 'var(--primary)' : '#d1d5db',
                cursor: 'pointer'
              }}
              title={`Go to slide ${i+1}`}
            />
          ))}
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
















