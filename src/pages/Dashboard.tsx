import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listCustomersWithOwed, type CustomerWithOwed, getAuthHeaders } from '../lib/api'
import { getTenantConfig } from '../lib/tenantConfig'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatMonthYear } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'
import { useCurrency } from '../lib/useCurrency'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'

// --- Chart label helpers ---
const fmtK1 = (n: number) => `${(n / 1000).toFixed(1)}K`
const fmtPct1 = (n: number) => `${(n * 100).toFixed(1)}%`

// Fixed-but-responsive height: shorter on phones, taller on desktop
const CHART_HEIGHT_CSS = 260

function getDeliveryVisual(order: any) {
  const deliveredQty = Number(order.delivered_quantity ?? 0)
  const totalQty = Number(order.total_qty ?? order.qty ?? 0)

  let status: 'not_delivered' | 'partial' | 'delivered'

  if (order.delivery_status) {
    status = order.delivery_status as any
  } else if (totalQty > 0) {
    if (deliveredQty <= 0) {
      status = 'not_delivered'
    } else if (deliveredQty >= totalQty) {
      status = 'delivered'
    } else {
      status = 'partial'
    }
  } else {
    // Fallback if qty missing: use boolean delivered
    status = order.delivered ? 'delivered' : 'not_delivered'
  }

  let symbol = '○'
  let color = '#d1d5db'
  let label = 'Not delivered'

  if (status === 'delivered') {
    symbol = '✓'
    color = '#10b981'
    label = totalQty
      ? `Delivered in full (${deliveredQty}/${totalQty})`
      : 'Delivered in full'
  } else if (status === 'partial') {
    symbol = '◐'
    color = '#f59e0b'
    label = totalQty
      ? `Partially delivered (${deliveredQty}/${totalQty})`
      : 'Partially delivered'
  }

  return { symbol, color, label, status }
}


type RpsPoint = {
  month: string            // "YYYY-MM"
  revenue: number          // from revenue_amount in the view
  gross_profit: number     // NEW: from gross_profit in the view
  grossPct: number         // NEW: gross_profit / revenue
  operating_profit: number
  operatingPct: number     // operating_profit / revenue
  surplus: number
  surplusPct: number       // surplus / revenue
}

// --- RPS monthly fetch (for Gross Profic, Operating profit & Surplus slides) ---
async function fetchRpsMonthly(months = 3): Promise<RpsPoint[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

  const res = await fetch(`${base}/api/rps/monthly?months=${months}`, {
  cache: 'no-store',
  headers: getAuthHeaders(),
})

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to load RPS monthly (status ${res.status}) ${text?.slice(0,140)}`)
  }

  const { rows } = await res.json()
  const safe = Array.isArray(rows) ? rows : []

  return safe.map((r: any) => {
    const revenue = Number(r.revenue ?? 0)
    const gross_profit = Number(r.gross_profit ?? 0)
    const operating_profit = Number(r.operating_profit ?? 0)
    const surplus = Number(r.surplus ?? 0)
    const grossPct = revenue > 0 ? gross_profit / revenue : 0
    const operatingPct = revenue > 0 ? operating_profit / revenue : 0
    const surplusPct = revenue > 0 ? surplus / revenue : 0

    return {
      month: String(r.month ?? ''),
      revenue,
      gross_profit,
      grossPct,
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

type ChartSlideProps = Omit<SlideSpec, 'title'> & { showPct: boolean }

function ChartSlide({
  data,
  bar1Key,
  bar2Key,
  lineKey,
  computePct,
  showPct,
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
          <ComposedChart data={enriched} margin={{ top: 12, right: 0, bottom: 6, left: 0 }}>
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
                return formatMonthYear(d)
              }}
            />
            {/* Left axis = $, hidden ticks; add 10% headroom */}
            <YAxis
              yAxisId="left"
              tick={false}
              axisLine={false}
              width={0}
              domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.35)]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={false}
              axisLine={false}
              width={0}
              domain={[0, 0.55]}
            />

            <Bar yAxisId="left" dataKey={bar1Key} fill="#f59e0b" isAnimationActive={false} barSize={33}>
              {!showPct && <LabelList dataKey={bar1Key} position="top" offset={8} formatter={(v: any) => `$${fmtK1(Number(v))}`} fill="#fff" style={{ fontSize: 11, fontWeight: 700 }} />}
            </Bar>
            <Bar yAxisId="left" dataKey={bar2Key} fill="#60a5fa" isAnimationActive={false} barSize={33}>
              {!showPct && <LabelList dataKey={bar2Key} position="top" offset={8} formatter={(v: any) => `$${fmtK1(Number(v))}`} fill="#fff" style={{ fontSize: 11, fontWeight: 700 }} />}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey={lineKey} stroke="#374151" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false}>
              {showPct && <LabelList dataKey={lineKey} position="bottom" offset={8} formatter={(v: any) => fmtPct1(Number(v))} fill="#fff" style={{ fontSize: 11, fontWeight: 700 }} />}
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Dashboard card registry ────────────────────────────────────────────────────

const ALL_CARDS = [
  { id: 'financials', labelKey: 'dashboard.cardFinancials' },
  { id: 'charts',     labelKey: 'dashboard.cardCharts'     },
  { id: 'orders',     labelKey: 'dashboard.cardOrders'     },
] as const

const LS_DASH_ORDER  = 'dashboard_order'
const LS_DASH_HIDDEN = 'dashboard_hidden'

function loadDashOrder(): string[] {
  try {
    const s = localStorage.getItem(LS_DASH_ORDER)
    if (s) {
      const saved: string[] = JSON.parse(s)
      const valid = saved.filter(id => ALL_CARDS.some(c => c.id === id))
      ALL_CARDS.forEach(c => { if (!valid.includes(c.id)) valid.push(c.id) })
      return valid
    }
  } catch {}
  return ALL_CARDS.map(c => c.id)
}

function loadDashVisible(defaultCards: string[]): string[] {
  try {
    const s = localStorage.getItem(LS_DASH_HIDDEN)
    if (s) {
      const hidden: string[] = JSON.parse(s)
      return ALL_CARDS.map(c => c.id).filter(id => !hidden.includes(id))
    }
  } catch {}
  return defaultCards
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { fmtMoney, fmtIntMoney } = useCurrency()
  const { user } = useAuth()
  const config = getTenantConfig(user?.tenantId)
  const showOwedToSuppliers = config.ui.showOwedToSuppliers

  const [customers, setCustomers] = useState<CustomerWithOwed[]>([])
  const [owedToSuppliers, setOwedToSuppliers] = useState(0)
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

  // RPS data for slides #2 and #3
  const [rpsMonthly, setRpsMonthly] = useState<RpsPoint[]>([])
  const [rpsLoading, setRpsLoading] = useState(true)
  const [rpsErr, setRpsErr] = useState<string | null>(null)

  const [showPct, setShowPct] = useState(false)

  // Dashboard card customisation
  const [dashOrder,    setDashOrder]    = useState<string[]>(loadDashOrder)
  const [dashVisible,  setDashVisible]  = useState<string[]>(() => loadDashVisible(config.ui.dashboardCards))
  const [dashDropOpen, setDashDropOpen] = useState(false)
  const dashBtnRef = useRef<HTMLButtonElement>(null)

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
const bootRes = await fetch(`${base}/api/bootstrap`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})
        if (!bootRes.ok) throw new Error('Failed to load partners')
        const boot = await bootRes.json()
        const partners: Array<{ id: string; name: string }> = boot.partners ?? []
        const jj = partners.find(p => (p.name || '').trim().toLowerCase() === 'jj boston')
        if (!jj) { setJjNet(0); return }
        const res = await fetch(`${base}/api/partner?id=${encodeURIComponent(jj.id)}`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})
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
        const res = await fetch(`${base}/api/recent-orders${filterParam}`, { 
  cache: 'no-store',
  headers: getAuthHeaders(),
})
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

  useEffect(() => {
    (async () => {
      try {
        const rpsRows = await fetchRpsMonthly(3)
        setRpsMonthly(rpsRows)
      } catch {}
    })()
  }, [recentOrders.length])

  // Load total owed to suppliers
  useEffect(() => {
    if (!showOwedToSuppliers) return
    ;(async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/suppliers`, { cache: 'no-store', headers: getAuthHeaders() })
        if (!res.ok) return
        const data = await res.json()
        const total = (data.suppliers ?? []).reduce((sum: number, s: any) => sum + Number(s.owed_to_supplier || 0), 0)
        setOwedToSuppliers(total)
      } catch { /* swallow */ }
    })()
  }, [showOwedToSuppliers])

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
    () => Math.max(0, Number(totalOwedToMe) - Number(owedToPartnersExJJ) - (showOwedToSuppliers ? Number(owedToSuppliers) : 0)),
    [totalOwedToMe, owedToPartnersExJJ, owedToSuppliers, showOwedToSuppliers]
  )

  // Show orders based on display count
  const shownOrders = recentOrders.slice(0, orderDisplayCount)

  // Compact layout constants (same as CustomerDetail)
  const LINE_GAP = 4

  // Handle delivery toggle for orders
    const handleDeliveryToggle = async (orderId: string, newDeliveredStatus: boolean) => {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/orders-delivery`, {
  method: 'PUT',
  headers: getAuthHeaders(),
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
        prev.map(order => {
          if (order.id !== orderId) return order
          const totalQty = Number(order.total_qty ?? order.qty ?? 0)
          const newDeliveredQty = newDeliveredStatus ? totalQty : 0
          const newStatus = newDeliveredStatus ? 'delivered' : 'not_delivered'
          return {
            ...order,
            delivered: newDeliveredStatus,
            delivered_quantity: newDeliveredQty,
            delivery_status: newStatus,
          }
        })
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
      ? t('dashboard.notDeliveredOrders')
      : t('dashboard.mostRecentOrders')

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
    title: t('dashboard.revenueGrossProfit'),
    data: rpsMonthly,
    bar1Key: 'revenue',
    bar2Key: 'gross_profit',
    lineKey: 'grossPct',
  }

  const slide2: SlideSpec = {
    title: t('dashboard.revenueOperatingProfit'),
    data: rpsMonthly,
    bar1Key: 'revenue',
    bar2Key: 'operating_profit',
    lineKey: 'operatingPct',
  }

  const slide3: SlideSpec = {
    title: t('dashboard.revenueSurplus'),
    data: rpsMonthly,
    bar1Key: 'revenue',
    bar2Key: 'surplus',
    lineKey: 'surplusPct',
  }

  const slides = [slide1, slide2, slide3]

  function toggleDashCard(id: string) {
    setDashVisible(v => {
      const next   = v.includes(id) ? v.filter(x => x !== id) : [...v, id]
      const hidden = ALL_CARDS.map(c => c.id).filter(cid => !next.includes(cid))
      localStorage.setItem(LS_DASH_HIDDEN, JSON.stringify(hidden))
      return next
    })
  }

  function moveDashCard(id: string, dir: -1 | 1) {
    setDashOrder(prev => {
      const idx  = prev.indexOf(id)
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      localStorage.setItem(LS_DASH_ORDER, JSON.stringify(next))
      return next
    })
  }

  const orderedVisible = dashOrder.filter(id => dashVisible.includes(id))

  const moveBtn = (disabled: boolean): React.CSSProperties => ({
    width: 24, height: 24, padding: 0, fontSize: 13, fontWeight: 700,
    color: 'var(--text-secondary)', opacity: disabled ? 0.25 : 1,
    background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
  })

  return (
    <div className="page-wide">
      {/* ── Header: title + card selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('dashboard.title')}</h2>
        <div>
          <button
            ref={dashBtnRef}
            onClick={() => setDashDropOpen(o => !o)}
            style={{ height: 36, padding: '0 14px', fontSize: 13 }}
          >
            {t('dashboard.title')} ▾
          </button>
          {dashDropOpen && (() => {
            const rect  = dashBtnRef.current?.getBoundingClientRect()
            const right = rect ? Math.max(8, window.innerWidth - rect.right) : 16
            const top   = rect ? rect.bottom + 4 : 60
            return (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setDashDropOpen(false)} />
                <div style={{
                  position: 'fixed', top, right, width: 180,
                  background: 'var(--card, #1e2130)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '4px 0', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                }}>
                  {ALL_CARDS.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={dashVisible.includes(c.id)}
                        onChange={() => toggleDashCard(c.id)}
                        style={{ width: 14, height: 14, flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 13 }}>{t(c.labelKey)}</span>
                    </label>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* ── Cards grid ── */}
      <div className="grid">
        {orderedVisible.map((cardId, idx) => {
          const isFirst = idx === 0
          const isLast  = idx === orderedVisible.length - 1
          const moveArrows = (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => moveDashCard(cardId, -1)} disabled={isFirst} style={moveBtn(isFirst)}>←</button>
              <button onClick={() => moveDashCard(cardId, 1)}  disabled={isLast}  style={moveBtn(isLast)}>→</button>
            </div>
          )

          if (cardId === 'financials') return (
            <div key="financials" className="card" style={{ alignSelf: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>{moveArrows}</div>
              {loading ? (
                <div className="helper">{t('loading')}</div>
              ) : err ? (
                <div style={{ color: 'var(--color-error)' }}>{t('error')} {err}</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('dashboard.totalOwedToMe')}</div>
                    <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>{fmtIntMoney(totalOwedToMe)}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('dashboard.owedToPartners')}</div>
                    <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>{fmtIntMoney(owedToPartnersExJJ)}</div>
                  </div>
                  {showOwedToSuppliers && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('dashboard.owedToSuppliers')}</div>
                      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>{fmtIntMoney(owedToSuppliers)}</div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginTop: 4, paddingTop: 8, borderTop: '1px solid #eee' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t('dashboard.myDollars')}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 20, color: 'var(--primary)' }}>{fmtIntMoney(myDollars)}</div>
                  </div>
                </div>
              )}
            </div>
          )

          if (cardId === 'charts') return (
            <div key="charts" className="card"
              style={{ display: 'flex', flexDirection: 'column', alignSelf: 'start' }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', marginBottom: 6, gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{slides[slide].title}</h3>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  {rpsLoading && <span className="helper">Loading…</span>}
                  {rpsErr && <span style={{ color: 'var(--color-error)' }}>{rpsErr}</span>}
                  <button onClick={() => setShowPct(v => !v)} style={{ fontSize: 11, padding: '2px 8px', height: 22, borderRadius: 4, background: showPct ? 'var(--accent)' : 'transparent', border: '1px solid var(--border)', color: showPct ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
                    {showPct ? t('dashboard.hidePct') : t('dashboard.showPct')}
                  </button>
                  {moveArrows}
                </div>
              </div>
              <div style={{ height: CHART_HEIGHT_CSS, position: 'relative', overflow: 'hidden' }}>
                <button onClick={prev} aria-label="Previous" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', fontSize: 30, color: 'var(--text-secondary)', lineHeight: 1 }}>‹</button>
                <div style={{ display: 'flex', height: '100%', width: '300%', transform: `translateX(-${slide * 33.3333}%)`, transition: 'transform 220ms ease' }}>
                  <div style={{ width:'33.3333%', height: '100%', paddingLeft: 12, paddingRight: 12, overflow: 'hidden' }}><ChartSlide {...slides[0]} showPct={showPct} /></div>
                  <div style={{ width:'33.3333%', height: '100%', paddingLeft: 12, paddingRight: 12, overflow: 'hidden' }}><ChartSlide {...slides[1]} showPct={showPct} /></div>
                  <div style={{ width:'33.3333%', height: '100%', paddingLeft: 12, paddingRight: 12, overflow: 'hidden' }}><ChartSlide {...slides[2]} showPct={showPct} /></div>
                </div>
                <button onClick={next} aria-label="Next" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', fontSize: 30, color: 'var(--text-secondary)', lineHeight: 1 }}>›</button>
              </div>
              <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:8 }}>
                {[0,1,2].map(i => (
                  <button key={i} onClick={() => setSlide(i as 0|1|2)} aria-pressed={slide===i}
                    style={{ width: 6, height: 6, borderRadius: '50%', border: 'none', background: slide===i ? 'var(--primary)' : '#d1d5db', cursor: 'pointer', padding: 0 }}
                    title={`Go to slide ${i+1}`}
                  />
                ))}
              </div>
            </div>
          )

          if (cardId === 'orders') return (
            <div key="orders" className="card">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>{moveArrows}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                <button className="primary"
                  onClick={() => { setOrderFilter('Most recent'); setOrderDisplayCount(5) }}
                  aria-pressed={orderFilter === 'Most recent'}
                  style={{ height: 'calc(var(--control-h) * 0.67)' }}>
                  {t('dashboard.mostRecent')}
                </button>
                <button className="primary"
                  onClick={() => { setOrderFilter('Not delivered'); setOrderDisplayCount(5) }}
                  aria-pressed={orderFilter === 'Not delivered'}
                  style={{ height: 'calc(var(--control-h) * 0.67)' }}>
                  {t('notDelivered')}
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap: 8, alignItems:'center', marginTop: 12 }}>
                <h3 style={{ margin:0, fontSize: 16 }}>{ordersTitle}</h3>
                {recentOrders.length > 5 && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {orderDisplayCount > 5 && (
                      <button className="helper" onClick={() => setOrderDisplayCount(5)}
                        style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}>
                        {t('dashboard.collapse')}
                      </button>
                    )}
                    {orderDisplayCount < 30 && recentOrders.length > orderDisplayCount && (
                      <button className="helper" onClick={() => setOrderDisplayCount(prev => prev + 5)}
                        style={{ background:'transparent', border:'none', padding:0, cursor:'pointer' }}>
                        {t('dashboard.showMore')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {ordersLoading ? (
                <p className="helper">{t('dashboard.loadingOrders')}</p>
              ) : ordersErr ? (
                <p style={{ color: 'var(--color-error)' }}>{t('dashboard.errorLoadingOrders', { error: ordersErr })}</p>
              ) : recentOrders.length === 0 ? (
                <p className="helper">{t('dashboard.noOrdersFound')}</p>
              ) : (
                <div style={{ display:'grid', marginTop: 12 }}>
                  {shownOrders.map(o => {
                    const cols = `50px 18px minmax(24px, max-content) 1fr auto`
                    const items: Array<{ product_name: string | null; qty: number; unit_price: number }> =
                      Array.isArray(o.items) && o.items.length > 0 ? o.items : []
                    const itemLine = (item: { product_name: string | null; qty: number; unit_price: number }) =>
                      `${item.product_name ?? 'Service'} / ${Number(item.qty).toLocaleString()} / ${fmtMoney(item.unit_price ?? 0)}`
                    const hasNotes = o.notes && o.notes.trim()
                    const orderTotal = Number(o.total) || 0
                    const paidAmount = Number((o as any).paid_amount) || 0
                    const amountColor = paidAmount >= orderTotal && orderTotal > 0
                      ? 'var(--color-success)'
                      : paidAmount > 0
                        ? 'var(--color-warning)'
                        : undefined
                    const { symbol, color, label } = getDeliveryVisual(o)
                    const deliveryIcon = (
                      <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'start' }}>
                        <button onClick={(e) => { e.stopPropagation(); handleDeliveryToggle(o.id, !o.delivered) }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14 }}
                          title={label}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, fontSize: 14, lineHeight: 1, color }}>{symbol}</span>
                        </button>
                      </div>
                    )
                    return (
                      <div key={o.id} style={{ borderBottom: '1px solid #eee', paddingTop: 12, paddingBottom: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: LINE_GAP, rowGap: LINE_GAP }}>
                          <div className="helper">{formatDate(o.order_date)}</div>
                          {deliveryIcon}
                          <div className="helper" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>#{o.order_no}</div>
                          <div className="helper" onClick={() => handleOrderClick(o)}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                            <div><strong>{o.customer_name}</strong></div>
                            {items.length > 0 && (
                              <div className="helper" style={{ opacity: 0.9, marginTop: 2 }}>{itemLine(items[0])}</div>
                            )}
                          </div>
                          <div className="helper" onClick={() => handleOrderClick(o)}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            style={{ textAlign: 'right', cursor: 'pointer', color: amountColor }}>
                            {fmtIntMoney(o.total)}
                          </div>
                          {items.slice(1).map((item, idx) => (
                            <React.Fragment key={idx}>
                              <div /><div /><div />
                              <div className="helper" onClick={() => handleOrderClick(o)}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                style={{ cursor: 'pointer', lineHeight: '1.4', paddingLeft: 4, opacity: 0.9 }}>
                                {itemLine(item)}
                              </div>
                              <div />
                            </React.Fragment>
                          ))}
                          {hasNotes && (
                            <React.Fragment>
                              <div /><div /><div />
                              <div className="helper" onClick={() => handleOrderClick(o)}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                                {o.notes}
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
          )

          return null
        })}
      </div>

      <OrderDetailModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
      />
    </div>
  )
}
















