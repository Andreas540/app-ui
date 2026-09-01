// src/pages/ReportsPage.tsx
// Financial Reports page — Sales & Profit.
// Dropdown to select which reports to show; ← → arrows to reorder.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import { useCurrency } from '../lib/useCurrency'
import {
  PICKER_STYLE,
  MonthPicker,
  YearPicker,
  fetchRpsData,
  type RpsPoint,
  type ReportDef,
  ChartSlide,
  ALL_REPORTS,
  VISIBLE_MOBILE,
  VISIBLE_DESKTOP,
} from '../components/RpsCharts'


const LS_ORDER  = 'reports_order'
const LS_HIDDEN = 'reports_hidden'
const LS_COLS   = 'reports_cols'

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


export default function ReportsPage() {
  const { t } = useTranslation('reports')
  const { t: tc } = useTranslation()
  const { user } = useAuth()
  const showInfoIcons = getTenantConfig(user?.tenantId).ui.showInfoIconsReports
  const { fmtMoney } = useCurrency()
  const [rpsData,      setRpsData]      = useState<RpsPoint[]>([])
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [order,        setOrder]        = useState<string[]>(loadOrder)
  const [visible,      setVisible]      = useState<string[]>(loadVisible)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [infoOpen,     setInfoOpen]     = useState<string | null>(null)

  useEffect(() => {
    if (!infoOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setInfoOpen(null) }
    const onDown = (e: MouseEvent) => {
      if (infoOverlayRef.current && !infoOverlayRef.current.contains(e.target as Node)) setInfoOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [infoOpen])

  const [showBy,       setShowBy]       = useState<'month' | 'year'>('month')
  const [fromMonth,    setFromMonth]    = useState('')
  const [toMonth,      setToMonth]      = useState('')
  const [fromYear,     setFromYear]     = useState('')
  const [toYear,       setToYear]       = useState('')
  const [visibleStart, setVisibleStart] = useState(0)
  const [showHint,     setShowHint]     = useState(false)
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 640)
  const [cols,         setCols]         = useState<2|3>(() => localStorage.getItem(LS_COLS) === '2' ? 2 : 3)
  const btnRef = useRef<HTMLButtonElement>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const infoOverlayRef = useRef<HTMLDivElement | null>(null)

  // Track mobile breakpoint
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const visibleCount = isMobile ? VISIBLE_MOBILE : VISIBLE_DESKTOP

  // Fetch data when date range or period type changes
  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr(null)
    const from = showBy === 'month' ? (fromMonth || undefined) : (fromYear || undefined)
    const to   = showBy === 'month' ? (toMonth   || undefined) : (toYear   || undefined)
    fetchRpsData(from, to, showBy)
      .then((rows: RpsPoint[]) => {
        if (stop) return
        setRpsData(rows)
        setLoading(false)
        const start = Math.max(0, rows.length - visibleCount)
        setVisibleStart(start)
        if (rows.length > visibleCount && isMobile) {
          setShowHint(true)
          if (hintTimer.current) clearTimeout(hintTimer.current)
          hintTimer.current = setTimeout(() => setShowHint(false), 2500)
        }
      })
      .catch((e: any) => { if (!stop) { setErr(e?.message || String(e)); setLoading(false) } })
    return () => { stop = true }
  }, [showBy, fromMonth, toMonth, fromYear, toYear]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Selecting From auto-fills To if To is empty
  function handleFromChange(val: string) {
    setFromMonth(val)
    if (val && !toMonth) {
      const now = new Date()
      setToMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    }
  }
  function handleFromYearChange(val: string) {
    setFromYear(val)
    if (val && !toYear) setToYear(String(new Date().getFullYear()))
  }
  function handleShowByChange(val: 'month' | 'year') {
    setShowBy(val)
    setFromMonth(''); setToMonth(''); setFromYear(''); setToYear('')
  }

  function saveCols(n: 2|3) { setCols(n); localStorage.setItem(LS_COLS, String(n)) }

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

  const periodLabel = useMemo(() => {
    if (showBy === 'year') {
      if (fromYear && toYear) return `${fromYear} – ${toYear}`
      if (fromYear) return `From ${fromYear}`
      if (toYear) return `To ${toYear}`
      return 'All years'
    }
    if (fromMonth && toMonth) return `${fromMonth} – ${toMonth}`
    if (fromMonth) return `From ${fromMonth}`
    if (toMonth) return `To ${toMonth}`
    return 'All periods'
  }, [showBy, fromMonth, toMonth, fromYear, toYear])

  function fmtPeriod(m: string) {
    if (showBy === 'year') return m
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  return (
    <div className="page-wide">
      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t('pageTitle')}</h3>

          {/* Cols toggle + Report selector dropdown + Print */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'underline' }}
            >
              Print
            </button>
            <div className="desktop-only" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {([2, 3] as const).map(n => (
                <button key={n} onClick={() => saveCols(n)} style={{
                  height: 36, width: 36, padding: 0, fontSize: 13, fontWeight: 600,
                  background: cols === n ? 'var(--primary)' : 'transparent',
                  color: cols === n ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                }}>{n}</button>
              ))}
            </div>
            <div>
            <button
              ref={btnRef}
              onClick={() => setDropdownOpen(o => !o)}
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
            >
              {t('pageTitle')} ▾
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
        </div>

        {/* ── Period picker ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap', rowGap: 10 }}>
          {/* Date pickers — always first */}
          {showBy === 'month' ? (
            <>
              <MonthPicker value={fromMonth} onChange={handleFromChange} placeholder={t('from')} />
              <MonthPicker value={toMonth} onChange={setToMonth} placeholder={t('to')} />
              {(fromMonth || toMonth) && (
                <button onClick={() => { setFromMonth(''); setToMonth('') }}
                  style={{ height: 34, padding: '0 12px', fontSize: 12, borderRadius: 6 }}>
                  {tc('clear')}
                </button>
              )}
            </>
          ) : (
            <>
              <YearPicker value={fromYear} onChange={handleFromYearChange} placeholder={t('from')} />
              <YearPicker value={toYear} onChange={setToYear} placeholder={t('to')} />
              {(fromYear || toYear) && (
                <button onClick={() => { setFromYear(''); setToYear('') }}
                  style={{ height: 34, padding: '0 12px', fontSize: 12, borderRadius: 6 }}>
                  {tc('clear')}
                </button>
              )}
            </>
          )}
          {/* Show by — after date pickers on desktop, wraps below on mobile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Show by</span>
            <select
              value={showBy}
              onChange={e => handleShowByChange(e.target.value as 'month' | 'year')}
              style={{ ...PICKER_STYLE, minWidth: 90 }}
            >
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error / loading */}
      {err     && <div className="card"><p style={{ color: 'var(--color-error)' }}>{tc('error')}: {err}</p></div>}
      {loading && <div className="card"><p className="helper">{tc('loadingDots')}</p></div>}

      {!loading && orderedVisible.length === 0 && (
        <div className="card">
          <p className="helper">{t('noReportsSelected')}</p>
        </div>
      )}

      {/* ── Print-only header ────────────────────────────────────────────── */}
      {!loading && orderedVisible.length > 0 && (
        <div className="print-only" style={{ display: 'none', marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{t('pageTitle')}</h2>
          <p style={{ margin: 0, color: '#666', fontSize: 13 }}>Period: {periodLabel}</p>
        </div>
      )}

      {/* ── Reports grid ─────────────────────────────────────────────────── */}
      {!loading && orderedVisible.length > 0 && (
        <div className="reports-print-grid" style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))'
            : cols === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: 16,
        }}>
          {orderedVisible.map((report, idx) => (
            <div key={report.id} className="card" style={{ padding: '12px 16px 16px', position: 'relative' }}>
              {infoOpen === report.id && (
                <div ref={infoOverlayRef} style={{
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
                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {['description_revenue', 'description_profit', 'description_note'].map((key: string) => (
                      <p key={key} style={{ margin: 0 }}>{t(`${report.id}.${key}`)}</p>
                    ))}
                  </div>
                </div>
              )}
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t(`${report.id}.title`)}</span>
                  {showInfoIcons && (
                    <button
                      onClick={() => setInfoOpen(infoOpen === report.id ? null : report.id)}
                      title={t('aboutReport')}
                      style={{
                        width: 20, height: 20, padding: 0, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%', cursor: 'pointer',
                        background: 'var(--border, rgba(255,255,255,0.15))',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
                      }}
                    >i</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => move(report.id, -1)} disabled={idx === 0}
                    title={t('moveLeft')}
                    style={{
                      width: 24, height: 24, padding: 0, fontSize: 13, fontWeight: 700,
                      color: 'var(--text-secondary)', opacity: idx === 0 ? 0.25 : 1,
                      background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >←</button>
                  <button
                    onClick={() => move(report.id, 1)} disabled={idx === orderedVisible.length - 1}
                    title={t('moveRight')}
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
                showBy={showBy}
                bar1Key={report.bar1Key}   bar1Label={t(report.bar1Label)}
                bar2Key={report.bar2Key}   bar2Label={t(report.bar2Label)}
                lineKey={report.lineKey}
                needsScroll={needsScroll}
                canPrev={canPrev}
                canNext={canNext}
                onPrev={() => nav(-1)}
                onNext={() => nav(1)}
                showHint={showHint}
              />

              {/* Print-only data table — uses full rpsData so all periods appear */}
              <table className="print-table" style={{ display: 'none' }}>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>{t(report.bar1Label)}</th>
                    <th>{t(report.bar2Label)}</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {rpsData.map(point => (
                    <tr key={point.month}>
                      <td>{fmtPeriod(point.month)}</td>
                      <td>{fmtMoney((point as any)[report.bar1Key])}</td>
                      <td>{fmtMoney((point as any)[report.bar2Key])}</td>
                      <td>{(((point as any)[report.lineKey] ?? 0) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
