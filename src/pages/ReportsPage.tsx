// src/pages/ReportsPage.tsx
// Financial Reports page — Sales & Profit.
// Dropdown to select which reports to show; ← → arrows to reorder.
import { useEffect, useMemo, useState } from 'react'
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

async function fetchRpsMonthly(months = 6): Promise<RpsPoint[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  const res = await fetch(`${base}/api/rps/monthly?months=${months}`, {
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
            <LabelList dataKey={lineKey} position="top" offset={12}
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
    bar1Key: 'revenue',    bar1Label: 'Revenue',
    bar2Key: 'gross_profit', bar2Label: 'Gross Profit',
    lineKey: 'grossPct',
  },
]

const LS_ORDER   = 'reports_order'
const LS_VISIBLE = 'reports_visible'

function loadOrder(): string[] {
  try { const s = localStorage.getItem(LS_ORDER);   if (s) return JSON.parse(s) } catch {}
  return ALL_REPORTS.map(r => r.id)
}
function loadVisible(): string[] {
  try { const s = localStorage.getItem(LS_VISIBLE); if (s) return JSON.parse(s) } catch {}
  return ALL_REPORTS.map(r => r.id)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [rpsData,      setRpsData]      = useState<RpsPoint[]>([])
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [order,        setOrder]        = useState<string[]>(loadOrder)
  const [visible,      setVisible]      = useState<string[]>(loadVisible)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    let stop = false
    fetchRpsMonthly(6)
      .then(rows => { if (!stop) { setRpsData(rows); setLoading(false) } })
      .catch(e   => { if (!stop) { setErr(e?.message || String(e)); setLoading(false) } })
    return () => { stop = true }
  }, [])

  useEffect(() => { localStorage.setItem(LS_ORDER,   JSON.stringify(order))   }, [order])
  useEffect(() => { localStorage.setItem(LS_VISIBLE, JSON.stringify(visible)) }, [visible])

  function toggleVisible(id: string) {
    setVisible(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])
  }

  function move(id: string, dir: -1 | 1) {
    setOrder(prev => {
      const idx  = prev.indexOf(id)
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
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
          <h3 style={{ margin: 0 }}>Sales &amp; Profit</h3>

          {/* Report selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
            >
              Reports ▾
            </button>
            {dropdownOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                  onClick={() => setDropdownOpen(false)}
                />
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '6px 0', zIndex: 100, minWidth: 220,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}>
                  {ALL_REPORTS.map(r => (
                    <label key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={visible.includes(r.id)}
                        onChange={() => toggleVisible(r.id)}
                      />
                      <span style={{ fontSize: 13 }}>{r.title}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
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
            <div key={report.id} className="card" style={{ padding: '12px 16px 16px' }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{report.title}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => move(report.id, -1)}
                    disabled={idx === 0}
                    title="Move left"
                    style={{
                      width: 28, height: 28, padding: 0, fontSize: 14,
                      opacity: idx === 0 ? 0.25 : 1,
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                    }}
                  >←</button>
                  <button
                    onClick={() => move(report.id, 1)}
                    disabled={idx === orderedVisible.length - 1}
                    title="Move right"
                    style={{
                      width: 28, height: 28, padding: 0, fontSize: 14,
                      opacity: idx === orderedVisible.length - 1 ? 0.25 : 1,
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
