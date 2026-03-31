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

const fmtK1  = (n: number) => `${(n / 1000).toFixed(1)}K`
const fmtPct1 = (n: number) => `${(n * 100).toFixed(1)}%`

// ── Month picker (two selects: month + year — works on all browsers) ──────────

const MONTH_OPTIONS = [
  { v: '01', label: 'Jan' }, { v: '02', label: 'Feb' }, { v: '03', label: 'Mar' },
  { v: '04', label: 'Apr' }, { v: '05', label: 'May' }, { v: '06', label: 'Jun' },
  { v: '07', label: 'Jul' }, { v: '08', label: 'Aug' }, { v: '09', label: 'Sep' },
  { v: '10', label: 'Oct' }, { v: '11', label: 'Nov' }, { v: '12', label: 'Dec' },
]

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('-') : ['', '']
  const selYear = parts[0] || ''
  const selMon  = parts[1] || ''
  const curYear = new Date().getFullYear()
  const years   = Array.from({ length: 6 }, (_, i) => curYear - 4 + i)

  function update(year: string, mon: string) {
    if (year && mon) onChange(`${year}-${mon}`)
    else onChange('')
  }

  const sel: React.CSSProperties = {
    height: 34, padding: '0 6px', fontSize: 13,
    borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--input, var(--card))', color: 'var(--text)',
  }

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select value={selMon} onChange={e => update(selYear || String(curYear), e.target.value)} style={sel}>
        <option value="">Mon</option>
        {MONTH_OPTIONS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
      </select>
      <select value={selYear} onChange={e => update(e.target.value, selMon)} style={sel}>
        <option value="">Year</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  )
}

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
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
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
  data: any[]
  bar1Key: string
  bar2Key: string
  lineKey: string
  computePct?: (row: any) => number
}

function ChartSlide({ data, bar1Key, bar2Key, lineKey, computePct }: ChartSlideProps) {
  const enriched = useMemo(() => {
    if (!computePct) return data
    return (data || []).map((r: any) => ({ ...r, [lineKey]: computePct(r) }))
  }, [data, computePct, lineKey])

  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={enriched} margin={{ top: 12, right: 0, bottom: 6, left: 0 }}>
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
          <YAxis yAxisId="left"  tick={false} axisLine={false} width={0}
            domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.1)]} />
          <YAxis yAxisId="right" orientation="right" tick={false} axisLine={false} width={0}
            domain={[0, 0.45]} />
          <Bar yAxisId="left" dataKey={bar1Key} fill="#f59e0b" isAnimationActive={false} barSize={33}>
            <LabelList dataKey={bar1Key} position="top" offset={12}
              formatter={(v: any) => `$${fmtK1(Number(v))}`} fill="#fff"
              style={{ fontSize: 12, fontWeight: 700 }} />
          </Bar>
          <Bar yAxisId="left" dataKey={bar2Key} fill="#60a5fa" isAnimationActive={false} barSize={33}>
            <LabelList dataKey={bar2Key} position="top" offset={12}
              formatter={(v: any) => `$${fmtK1(Number(v))}`} fill="#fff"
              style={{ fontSize: 12, fontWeight: 700 }} />
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey={lineKey} stroke="#374151"
            strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false}>
            <LabelList dataKey={lineKey} position="bottom" offset={10}
              formatter={(v: any) => fmtPct1(Number(v))} fill="#fff"
              style={{ fontSize: 12, fontWeight: 700 }} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Report definitions ────────────────────────────────────────────────────────

type ReportDef = {
  id: string
  title: string
  description: string
  bar1Key: string
  bar1Label: string
  bar2Key: string
  bar2Label: string
  lineKey: string
}

const ALL_REPORTS: ReportDef[] = [
  {
    id: 'revenue_gross_profit',
    title: 'Revenue & Gross Profit',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    bar1Key: 'revenue',    bar1Label: 'Revenue',
    bar2Key: 'gross_profit', bar2Label: 'Gross Profit',
    lineKey: 'grossPct',
  },
  {
    id: 'revenue_operating_profit',
    title: 'Revenue & Operating Profit',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.',
    bar1Key: 'revenue',         bar1Label: 'Revenue',
    bar2Key: 'operating_profit', bar2Label: 'Operating Profit',
    lineKey: 'operatingPct',
  },
]

const LS_ORDER  = 'reports_order'
const LS_HIDDEN = 'reports_hidden'  // IDs explicitly unchecked by the user

function loadOrder(): string[] {
  try {
    const s = localStorage.getItem(LS_ORDER)
    if (s) {
      const saved: string[] = JSON.parse(s)
      // strip removed reports, append any newly added ones
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
      // visible = all reports minus explicitly hidden ones
      return ALL_REPORTS.map(r => r.id).filter(id => !hidden.includes(id))
    }
  } catch {}
  return ALL_REPORTS.map(r => r.id)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { t } = useTranslation()
  const [rpsData,      setRpsData]      = useState<RpsPoint[]>([])
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [order,        setOrder]        = useState<string[]>(loadOrder)
  const [visible,      setVisible]      = useState<string[]>(loadVisible)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [infoOpen, setInfoOpen]         = useState<string | null>(null)
  const [fromMonth, setFromMonth]       = useState('')
  const [toMonth, setToMonth]           = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr(null)
    fetchRpsData(fromMonth || undefined, toMonth || undefined)
      .then((rows: RpsPoint[]) => { if (!stop) { setRpsData(rows); setLoading(false) } })
      .catch((e: any) => { if (!stop) { setErr(e?.message || String(e)); setLoading(false) } })
    return () => { stop = true }
  }, [fromMonth, toMonth])

  function toggleVisible(id: string) {
    setVisible(v => {
      const next = v.includes(id) ? v.filter(x => x !== id) : [...v, id]
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

          {/* Report selector */}
          <div>
            <button
              ref={btnRef}
              onClick={() => setDropdownOpen(o => !o)}
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
            >
              {t('reports.pageTitle')} ▾
            </button>
            {dropdownOpen && (() => {
              const rect = btnRef.current?.getBoundingClientRect()
              const dropW = 200
              // Anchor right edge of dropdown to right edge of button, clamped to viewport
              const rawRight = rect ? window.innerWidth - rect.right : 16
              const right = Math.max(8, rawRight)
              const top = rect ? rect.bottom + 4 : 60
              return (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div style={{
                    position: 'fixed',
                    top,
                    right,
                    width: dropW,
                    maxWidth: `calc(100vw - ${right + 8}px)`,
                    background: 'var(--card, #1e2130)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '4px 0',
                    zIndex: 100,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  }}>
                    {ALL_REPORTS.map(r => (
                      <label key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px', cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={visible.includes(r.id)}
                          onChange={() => toggleVisible(r.id)}
                          style={{ width: 14, height: 14, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13 }}>{r.title}</span>
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
            <MonthPicker value={fromMonth} onChange={setFromMonth} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>To</div>
            <MonthPicker value={toMonth} onChange={setToMonth} />
          </div>
          {(fromMonth || toMonth) && (
            <button
              onClick={() => { setFromMonth(''); setToMonth('') }}
              style={{ height: 34, padding: '0 12px', fontSize: 12, borderRadius: 6 }}
            >
              {t('clear')}
            </button>
          )}
        </div>
      </div>

      {/* Error / loading */}
      {err && <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>}
      {loading && <div className="card"><p className="helper">Loading…</p></div>}

      {!loading && orderedVisible.length === 0 && (
        <div className="card">
          <p className="helper">No reports selected. Use the Reports button above to choose which reports to show.</p>
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
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                    onClick={() => setInfoOpen(null)}
                  />
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'var(--card, #1e2130)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '16px 20px',
                    zIndex: 200,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{report.title}</div>
                      <button
                        onClick={() => setInfoOpen(null)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
                      >✕</button>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {report.description}
                    </p>
                  </div>
                </>
              )}
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{report.title}</span>
                  <button
                    onClick={() => setInfoOpen(infoOpen === report.id ? null : report.id)}
                    title="About this report"
                    style={{
                      width: 20, height: 20, padding: 0, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%', cursor: 'pointer',
                      background: 'var(--border, rgba(255,255,255,0.15))',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >i</button>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => move(report.id, -1)}
                    disabled={idx === 0}
                    title="Move left"
                    style={{
                      width: 28, height: 28, padding: 0, fontSize: 16, fontWeight: 700,
                      color: '#fff', opacity: idx === 0 ? 0.2 : 1,
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                    }}
                  >←</button>
                  <button
                    onClick={() => move(report.id, 1)}
                    disabled={idx === orderedVisible.length - 1}
                    title="Move right"
                    style={{
                      width: 28, height: 28, padding: 0, fontSize: 16, fontWeight: 700,
                      color: '#fff', opacity: idx === orderedVisible.length - 1 ? 0.2 : 1,
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                    }}
                  >→</button>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', marginBottom: 6 }}>
                {[
                  { color: '#f59e0b', label: report.bar1Label },
                  { color: '#60a5fa', label: report.bar2Label },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <ChartSlide
                data={rpsData}
                bar1Key={report.bar1Key}
                bar2Key={report.bar2Key}
                lineKey={report.lineKey}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
