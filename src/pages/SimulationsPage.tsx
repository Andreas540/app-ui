// src/pages/SimulationsPage.tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PICKER_STYLE,
  MonthPicker,
  YearPicker,
  fetchRpsData,
  type RpsPoint,
  ChartSlide,
  ALL_REPORTS,
  VISIBLE_MOBILE,
  VISIBLE_DESKTOP,
} from '../components/RpsCharts'

const LS_COLS = 'simulations_cols'

export default function SimulationsPage() {
  const { t } = useTranslation('reports')
  const { t: tc } = useTranslation()

  const [simType,   setSimType]   = useState<'sales-profit'>('sales-profit')
  const [showBy,    setShowBy]    = useState<'month' | 'year'>('month')
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth,   setToMonth]   = useState('')
  const [fromYear,  setFromYear]  = useState('')
  const [toYear,    setToYear]    = useState('')

  const [rpsData,      setRpsData]      = useState<RpsPoint[]>([])
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [visibleStart, setVisibleStart] = useState(0)
  const [showHint,     setShowHint]     = useState(false)
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 640)
  const [cols,         setCols]         = useState<2|3>(() => localStorage.getItem(LS_COLS) === '2' ? 2 : 3)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const visibleCount = isMobile ? VISIBLE_MOBILE : VISIBLE_DESKTOP

  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr(null)
    const from = showBy === 'month' ? (fromMonth || undefined) : (fromYear || undefined)
    const to   = showBy === 'month' ? (toMonth   || undefined) : (toYear   || undefined)
    fetchRpsData(from, to, showBy)
      .then((rows) => {
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

  const clampedStart = Math.min(visibleStart, Math.max(0, rpsData.length - visibleCount))
  const visibleData  = rpsData.slice(clampedStart, clampedStart + visibleCount)
  const needsScroll  = rpsData.length > visibleCount
  const canPrev      = clampedStart > 0
  const canNext      = clampedStart + visibleCount < rpsData.length

  function nav(dir: -1 | 1) {
    setVisibleStart(v => Math.max(0, Math.min(v + dir, rpsData.length - visibleCount)))
  }

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

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {t('simulationsTitle', 'Simulations')}
        </h1>
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
      </div>

      {/* Simulation type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Simulation type</span>
        <select
          value={simType}
          onChange={e => setSimType(e.target.value as 'sales-profit')}
          style={{ ...PICKER_STYLE, minWidth: 160 }}
        >
          <option value="sales-profit">Sales &amp; Profit</option>
        </select>
      </div>

      {/* Period picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap', rowGap: 10 }}>
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

      {/* Error / loading */}
      {err     && <div className="card"><p style={{ color: 'var(--color-error)' }}>{tc('error')}: {err}</p></div>}
      {loading && <div className="card"><p className="helper">{tc('loadingDots')}</p></div>}

      {/* Charts */}
      {!loading && simType === 'sales-profit' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))'
            : cols === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: 16,
        }}>
          {ALL_REPORTS.map(report => (
            <div key={report.id} className="card" style={{ padding: '12px 16px 16px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                {t(`${report.id}.title`)}
              </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
