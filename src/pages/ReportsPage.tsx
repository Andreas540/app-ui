// src/pages/ReportsPage.tsx
// Financial Reports page — Sales & Profit.
// Dropdown to select which reports to show; ← → arrows to reorder.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtK1   = (n: number) => `${(n / 1000).toFixed(1)}K`
const fmtPct1 = (n: number) => `${(n * 100).toFixed(1)}%`

// ── Month picker — single select, last 24 months ──────────────────────────────

function MonthPicker({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const opts: { val: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ val, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }) })
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        height: 34, padding: '0 8px', fontSize: 13, borderRadius: 6, minWidth: 130,
        border: '1px solid var(--border)',
        background: 'var(--input, var(--card))', color: 'var(--text)',
      }}
    >
      <option value="">{placeholder ?? 'Select...'}</option>
      {opts.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
    </select>
  )
}

// ── Data types & fetch ────────────────────────────────────────────────────────

type RpsPoint = {
  month: string
  revenue: number
  gross_profit: number
  grossPct: number
  operating_profit: number
  operatingPct: number
  surplus: number
  surplusPct: number
}

async function fetchRpsData(from?: string, to?: string): Promise<RpsPoint[]> {
  const base   = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const params = (from && to)
    ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    : 'months=3'
  const res = await fetch(`${base}/api/rps/monthly?${params}`, {
    cache: 'no-store',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`)
  const { rows } = await res.json()
  const safe = Array.isArray(rows) ? rows : []
  return safe.map((r: any) => {
    const revenue          = Number(r.revenue          ?? 0)
    const gross_profit     = Number(r.gross_profit     ?? 0)
    const operating_profit = Number(r.operating_profit ?? 0)
    const surplus          = Number(r.surplus          ?? 0)
    return {
      month: String(r.month ?? ''),
      revenue,
      gross_profit,
      grossPct:      revenue > 0 ? gross_profit     / revenue : 0,
      operating_profit,
      operatingPct:  revenue > 0 ? operating_profit / revenue : 0,
      surplus,
      surplusPct:    revenue > 0 ? surplus          / revenue : 0,
    }
  })
}

// ── Chart component ───────────────────────────────────────────────────────────

type ChartSlideProps = {
  data: RpsPoint[]       // already-sliced visible window
  bar1Key: string
  bar1Label: string
  bar2Key: string
  bar2Label: string
  lineKey: string
  computePct?: (row: any) => number
  needsScroll: boolean
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  showHint: boolean
}

function ChartSlide({
  data, bar1Key, bar1Label, bar2Key, bar2Label, lineKey, computePct,
  needsScroll, canPrev, canNext, onPrev, onNext, showHint,
}: ChartSlideProps) {
  const [showPct, setShowPct] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const enriched = useMemo(() => {
    if (!computePct) return data
    return (data || []).map((r: any) => ({ ...r, [lineKey]: computePct(r) }))
  }, [data, computePct, lineKey])

  const navBtn = (disabled: boolean) => ({
    width: 32, height: 32, padding: 0, fontSize: 16, fontWeight: 700,
    background: 'transparent' as const,
    border: '1px solid var(--border)', borderRadius: 6,
    color: disabled ? 'var(--text-secondary)' : 'var(--text)',
    opacity: disabled ? 0.3 : 1,
    cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
  })

  return (
    <div>
      {/* Legend + Show/Hide % toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6, flexWrap: 'wrap', gap: 6,
      }}>
        <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap' }}>
          {[{ color: '#f59e0b', label: bar1Label }, { color: '#60a5fa', label: bar2Label }].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowPct(v => !v)}
          style={{
            fontSize: 11, padding: '2px 8px', height: 22, borderRadius: 4,
            background: showPct ? 'var(--accent)' : 'transparent',
            border: '1px solid var(--border)',
            color: showPct ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {showPct ? 'Hide Profit %' : 'Show Profit %'}
        </button>
      </div>

      {/* Chart with swipe/wheel/hint */}
      <div
        style={{ position: 'relative', height: 260 }}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return
          const dx = e.changedTouches[0].clientX - touchStartX.current
          touchStartX.current = null
          if (Math.abs(dx) < 40) return
          if (dx < 0 && canNext) onNext()
          if (dx > 0 && canPrev) onPrev()
        }}
        onWheel={(e) => {
          if (!needsScroll || Math.abs(e.deltaX) < 20) return
          if (e.deltaX > 0 && canNext) onNext()
          if (e.deltaX < 0 && canPrev) onPrev()
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={enriched} margin={{ top: 14, right: 0, bottom: 6, left: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
              tickLine={false}
              tickFormatter={(m) => {
                const [y, mm] = (m || '').split('-').map(Number)
                if (!y || !mm) return String(m || '')
                return new Date(y, mm - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
              }}
            />
            {/* Wider domain headroom so bar labels sit above bars without overlap */}
            <YAxis yAxisId="left"  tick={false} axisLine={false} width={0}
              domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.35)]} />
            <YAxis yAxisId="right" orientation="right" tick={false} axisLine={false} width={0}
              domain={[0, 0.55]} />

            <Bar yAxisId="left" dataKey={bar1Key} fill="#f59e0b" isAnimationActive={false}>
              {!showPct && (
                <LabelList dataKey={bar1Key} position="top" offset={8}
                  formatter={(v: any) => `$${fmtK1(Number(v))}`} fill="#fff"
                  style={{ fontSize: 11, fontWeight: 700 }} />
              )}
            </Bar>
            <Bar yAxisId="left" dataKey={bar2Key} fill="#60a5fa" isAnimationActive={false}>
              {!showPct && (
                <LabelList dataKey={bar2Key} position="top" offset={8}
                  formatter={(v: any) => `$${fmtK1(Number(v))}`} fill="#fff"
                  style={{ fontSize: 11, fontWeight: 700 }} />
              )}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey={lineKey} stroke="#374151"
              strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false}>
              {showPct && (
                <LabelList dataKey={lineKey} position="top" offset={8}
                  formatter={(v: any) => fmtPct1(Number(v))} fill="#fff"
                  style={{ fontSize: 11, fontWeight: 700 }} />
              )}
            </Line>
          </ComposedChart>
        </ResponsiveContainer>

        {/* Swipe hint — flashes briefly when data loads with more months than visible */}
        {showHint && needsScroll && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 10, borderRadius: 8,
            background: 'rgba(0,0,0,0.48)',
          }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '0 16px' }}>
              ← Swipe to see all periods →
            </span>
          </div>
        )}
      </div>

      {/* Period navigation arrows */}
      {needsScroll && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
          <button onClick={onPrev} disabled={!canPrev} style={navBtn(!canPrev)}>←</button>
          <button onClick={onNext} disabled={!canNext} style={navBtn(!canNext)}>→</button>
        </div>
      )}
    </div>
  )
}

// ── Report definitions ────────────────────────────────────────────────────────

type ReportDef = {
  id: string
  bar1Key: string
  bar1Label: string
  bar2Key: string
  bar2Label: string
  lineKey: string
}

const ALL_REPORTS: ReportDef[] = [
  {
    id: 'revenue_gross_profit',
    bar1Key: 'revenue',      bar1Label: 'Revenue',
    bar2Key: 'gross_profit', bar2Label: 'Gross Profit',
    lineKey: 'grossPct',
  },
  {
    id: 'revenue_operating_profit',
    bar1Key: 'revenue',          bar1Label: 'Revenue',
    bar2Key: 'operating_profit', bar2Label: 'Operating Profit',
    lineKey: 'operatingPct',
  },
]

const LS_ORDER  = 'reports_order'
const LS_HIDDEN = 'reports_hidden'

function loadOrder(): string[] {
  try {
    const s = localStorage.getItem(LS_ORDER)
    if (s) {
      const saved: string[] = JSON.parse(s)
      const valid = saved.filter(id => ALL_REPORTS.some(r => r.id === id))
      ALL_REPORTS.forEach(r => { if (!valid.includes(r.id)) valid.push(r.id) })
      return valid
    }
  } catch {}
  return ALL_REPORTS.map(r => r.id)
}
function loadVisible(): string[] {
  try {
    const s = localStorage.getItem(LS_HIDDEN)
    if (s) {
      const hidden: string[] = JSON.parse(s)
      return ALL_REPORTS.map(r => r.id).filter(id => !hidden.includes(id))
    }
  } catch {}
  return ALL_REPORTS.map(r => r.id)
}

// ── Page ──────────────────────────────────────────────────────────────────────

const VISIBLE_MOBILE  = 3
const VISIBLE_DESKTOP = 6

export default function ReportsPage() {
  const { t } = useTranslation('reports')
  const { t: tc } = useTranslation()
  const [rpsData,      setRpsData]      = useState<RpsPoint[]>([])
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [order,        setOrder]        = useState<string[]>(loadOrder)
  const [visible,      setVisible]      = useState<string[]>(loadVisible)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [infoOpen,     setInfoOpen]     = useState<string | null>(null)
  const [fromMonth,    setFromMonth]    = useState('')
  const [toMonth,      setToMonth]      = useState('')
  const [visibleStart, setVisibleStart] = useState(0)
  const [showHint,     setShowHint]     = useState(false)
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 640)
  const btnRef = useRef<HTMLButtonElement>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track mobile breakpoint
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const visibleCount = isMobile ? VISIBLE_MOBILE : VISIBLE_DESKTOP

  // Fetch data when date range changes
  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr(null)
    fetchRpsData(fromMonth || undefined, toMonth || undefined)
      .then((rows: RpsPoint[]) => {
        if (stop) return
        setRpsData(rows)
        setLoading(false)
        // Start at the most recent data
        const start = Math.max(0, rows.length - visibleCount)
        setVisibleStart(start)
        // Flash swipe hint on mobile when there's more data than fits
        if (rows.length > visibleCount && isMobile) {
          setShowHint(true)
          if (hintTimer.current) clearTimeout(hintTimer.current)
          hintTimer.current = setTimeout(() => setShowHint(false), 2500)
        }
      })
      .catch((e: any) => { if (!stop) { setErr(e?.message || String(e)); setLoading(false) } })
    return () => { stop = true }
  }, [fromMonth, toMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp visibleStart if visibleCount changes (e.g. screen resize)
  const clampedStart = Math.min(visibleStart, Math.max(0, rpsData.length - visibleCount))
  const visibleData  = rpsData.slice(clampedStart, clampedStart + visibleCount)
  const needsScroll  = rpsData.length > visibleCount
  const canPrev      = clampedStart > 0
  const canNext      = clampedStart + visibleCount < rpsData.length

  function nav(dir: -1 | 1) {
    setVisibleStart(v => {
      const next = v + dir
      return Math.max(0, Math.min(next, rpsData.length - visibleCount))
    })
  }

  // Selecting From auto-fills To with current month if To is empty
  function handleFromChange(val: string) {
    setFromMonth(val)
    if (val && !toMonth) {
      const now = new Date()
      setToMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    }
  }

  function toggleVisible(id: string) {
    setVisible(v => {
      const next   = v.includes(id) ? v.filter(x => x !== id) : [...v, id]
      const hidden = ALL_REPORTS.map(r => r.id).filter(rid => !next.includes(rid))
      localStorage.setItem(LS_HIDDEN, JSON.stringify(hidden))
      return next
    })
  }

  function move(id: string, dir: -1 | 1) {
    setOrder(prev => {
      const idx  = prev.indexOf(id)
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      localStorage.setItem(LS_ORDER, JSON.stringify(next))
      return next
    })
  }

  const orderedVisible = order
    .map(id => ALL_REPORTS.find(r => r.id === id))
    .filter((r): r is ReportDef => !!r && visible.includes(r.id))

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t('reports.pageTitle')}</h3>

          {/* Report selector dropdown */}
          <div>
            <button
              ref={btnRef}
              onClick={() => setDropdownOpen(o => !o)}
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
            >
              {t('reports.pageTitle')} ▾
            </button>
            {dropdownOpen && (() => {
              const rect   = btnRef.current?.getBoundingClientRect()
              const dropW  = 200
              const rawRight = rect ? window.innerWidth - rect.right : 16
              const right  = Math.max(8, rawRight)
              const top    = rect ? rect.bottom + 4 : 60
              return (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setDropdownOpen(false)} />
                  <div style={{
                    position: 'fixed', top, right, width: dropW,
                    maxWidth: `calc(100vw - ${right + 8}px)`,
                    background: 'var(--card, #1e2130)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '4px 0', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  }}>
                    {ALL_REPORTS.map(r => (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={visible.includes(r.id)}
                          onChange={() => toggleVisible(r.id)}
                          style={{ width: 14, height: 14, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13 }}>{t(`${r.id}.title`)}</span>
                      </label>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* ── Period picker ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 14, flexWrap: 'wrap', rowGap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>From</div>
            <MonthPicker value={fromMonth} onChange={handleFromChange} placeholder="From" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>To</div>
            <MonthPicker value={toMonth} onChange={setToMonth} placeholder="To" />
          </div>
          {(fromMonth || toMonth) && (
            <button
              onClick={() => { setFromMonth(''); setToMonth('') }}
              style={{ height: 34, padding: '0 12px', fontSize: 12, borderRadius: 6 }}
            >
              {tc('clear')}
            </button>
          )}
        </div>
      </div>

      {/* Error / loading */}
      {err     && <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>}
      {loading && <div className="card"><p className="helper">Loading…</p></div>}

      {!loading && orderedVisible.length === 0 && (
        <div className="card">
          <p className="helper">{t('noReportsSelected')}</p>
        </div>
      )}

      {/* ── Reports grid ─────────────────────────────────────────────────── */}
      {!loading && orderedVisible.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))',
          gap: 16,
        }}>
          {orderedVisible.map((report, idx) => (
            <div key={report.id} className="card" style={{ padding: '12px 16px 16px', position: 'relative' }}>
              {/* Info modal overlay */}
              {infoOpen === report.id && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setInfoOpen(null)} />
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'var(--card, #1e2130)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '16px 20px', zIndex: 200,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t(`${report.id}.title`)}</div>
                      <button
                        onClick={() => setInfoOpen(null)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
                      >✕</button>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {['description_revenue', 'description_profit', 'description_note'].map((key: string) => (
                        <p key={key} style={{ margin: 0 }}>{t(`${report.id}.${key}`)}</p>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t(`${report.id}.title`)}</span>
                  <button
                    onClick={() => setInfoOpen(infoOpen === report.id ? null : report.id)}
                    title="About this report"
                    style={{
                      width: 20, height: 20, padding: 0, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%', cursor: 'pointer',
                      background: 'var(--border, rgba(255,255,255,0.15))',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
                    }}
                  >i</button>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => move(report.id, -1)} disabled={idx === 0}
                    title="Move left"
                    style={{
                      width: 24, height: 24, padding: 0, fontSize: 13, fontWeight: 700,
                      color: 'var(--text-secondary)', opacity: idx === 0 ? 0.25 : 1,
                      background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >←</button>
                  <button
                    onClick={() => move(report.id, 1)} disabled={idx === orderedVisible.length - 1}
                    title="Move right"
                    style={{
                      width: 24, height: 24, padding: 0, fontSize: 13, fontWeight: 700,
                      color: 'var(--text-secondary)', opacity: idx === orderedVisible.length - 1 ? 0.25 : 1,
                      background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >→</button>
                </div>
              </div>

              {/* Chart (legend + Show % toggle now inside ChartSlide) */}
              <ChartSlide
                data={visibleData}
                bar1Key={report.bar1Key}   bar1Label={report.bar1Label}
                bar2Key={report.bar2Key}   bar2Label={report.bar2Label}
                lineKey={report.lineKey}
                needsScroll={needsScroll}
                canPrev={canPrev}
                canNext={canNext}
                onPrev={() => nav(-1)}
                onNext={() => nav(1)}
                showHint={showHint}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
