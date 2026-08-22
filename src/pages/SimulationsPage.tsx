// src/pages/SimulationsPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'

const LS_COLS = 'simulations_cols'

type Factor    = 'repayment' | 'partner_share'
type FactorRow = { period_start: string; amount: number }

async function fetchFactorData(
  factor: Factor,
  from?: string,
  to?: string,
  period: 'month' | 'year' = 'month',
): Promise<FactorRow[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  let params = `factor=${factor}&period=${period}`
  if (from && to) params += `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const res = await fetch(`${base}/api/sim-factors?${params}`, {
    cache: 'no-store',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to load factor data (${res.status})`)
  const { rows } = await res.json()
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    period_start: String(r.period_start ?? ''),
    amount:       Number(r.amount ?? 0),
  }))
}

export default function SimulationsPage() {
  const { t }  = useTranslation('reports')
  const { t: tc } = useTranslation()
  const { fmtMoney } = useCurrency()

  // Simulation config
  const [simType,    setSimType]    = useState<'sales-profit'>('sales-profit')
  const [factor,     setFactor]     = useState<Factor>('repayment')
  const [changeSign, setChangeSign] = useState<'+' | '-'>('+')
  const [changePct,  setChangePct]  = useState(0)

  // Date / period
  const [showBy,    setShowBy]    = useState<'month' | 'year'>('month')
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth,   setToMonth]   = useState('')
  const [fromYear,  setFromYear]  = useState('')
  const [toYear,    setToYear]    = useState('')

  // Data
  const [rpsData,    setRpsData]    = useState<RpsPoint[]>([])
  const [factorData, setFactorData] = useState<FactorRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState<string | null>(null)

  // Scroll / layout
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

  // Fetch RPS base data
  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr(null)
    const from = showBy === 'month' ? (fromMonth || undefined) : (fromYear || undefined)
    const to   = showBy === 'month' ? (toMonth   || undefined) : (toYear   || undefined)
    fetchRpsData(from, to, showBy)
      .then(rows => {
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

  // Fetch factor amounts (same date range as RPS)
  useEffect(() => {
    let stop = false
    const from = showBy === 'month' ? (fromMonth || undefined) : (fromYear || undefined)
    const to   = showBy === 'month' ? (toMonth   || undefined) : (toYear   || undefined)
    fetchFactorData(factor, from, to, showBy)
      .then(rows => { if (!stop) setFactorData(rows) })
      .catch(() => { if (!stop) setFactorData([]) })
    return () => { stop = true }
  }, [factor, showBy, fromMonth, toMonth, fromYear, toYear])

  // Apply simulation: adjust gross_profit and operating_profit by factor delta
  const simData = useMemo((): RpsPoint[] => {
    if (changePct === 0) return rpsData
    const effectivePct = (changeSign === '+' ? 1 : -1) * changePct / 100
    return rpsData.map(point => {
      const fRow = factorData.find(f =>
        showBy === 'year'
          ? f.period_start.substring(0, 4) === point.month
          : f.period_start.substring(0, 7) === point.month
      )
      const factorAmt   = fRow?.amount ?? 0
      const profitDelta = -factorAmt * effectivePct  // factor up → profit down
      const gp = point.gross_profit + profitDelta
      const op = point.operating_profit + profitDelta
      return {
        ...point,
        gross_profit:     gp,
        grossPct:         point.revenue > 0 ? gp / point.revenue : 0,
        operating_profit: op,
        operatingPct:     point.revenue > 0 ? op / point.revenue : 0,
      }
    })
  }, [rpsData, factorData, changePct, changeSign, showBy])

  // Total profit impact across all periods in the current date range
  const totalImpact = useMemo(() => {
    if (changePct === 0) return 0
    const effectivePct = (changeSign === '+' ? 1 : -1) * changePct / 100
    const rpsMonths = new Set(rpsData.map(d => d.month))
    return factorData.reduce((sum, f) => {
      const key = showBy === 'year' ? f.period_start.substring(0, 4) : f.period_start.substring(0, 7)
      return rpsMonths.has(key) ? sum - f.amount * effectivePct : sum
    }, 0)
  }, [factorData, rpsData, changePct, changeSign, showBy])

  const clampedStart   = Math.min(visibleStart, Math.max(0, simData.length - visibleCount))
  const visibleSimData = simData.slice(clampedStart, clampedStart + visibleCount)
  const needsScroll    = simData.length > visibleCount
  const canPrev        = clampedStart > 0
  const canNext        = clampedStart + visibleCount < simData.length

  function nav(dir: -1 | 1) {
    setVisibleStart(v => Math.max(0, Math.min(v + dir, simData.length - visibleCount)))
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

  const factorLabel = factor === 'repayment' ? 'Repayments' : 'Partner share'
  const signBtn = (s: '+' | '-') => ({
    height: 34, width: 34, padding: 0, fontSize: 16, fontWeight: 700,
    background: changeSign === s ? 'var(--primary)' : 'transparent',
    color: changeSign === s ? '#fff' : 'var(--text-secondary)',
    border: 'none', cursor: 'pointer' as const,
  })

  return (
    <div className="page-wide">

      {/* ── Header ── */}
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

      {/* ── Simulation type + Factor + Change ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap', rowGap: 10 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Simulation type</span>
          <select
            value={simType}
            onChange={e => setSimType(e.target.value as 'sales-profit')}
            style={{ ...PICKER_STYLE, minWidth: 160 }}
          >
            <option value="sales-profit">Sales &amp; Profit</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Factor</span>
          <select
            value={factor}
            onChange={e => setFactor(e.target.value as Factor)}
            style={{ ...PICKER_STYLE, minWidth: 140 }}
          >
            <option value="repayment">Repayment</option>
            <option value="partner_share">Partner share</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Change</span>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button onClick={() => setChangeSign('+')} style={signBtn('+')}>+</button>
            <button onClick={() => setChangeSign('-')} style={signBtn('-')}>−</button>
          </div>
          <input
            type="number"
            value={changePct === 0 ? '' : changePct}
            min={0}
            placeholder="0"
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              if (isNaN(v) || v < 0) { setChangePct(0); return }
              if (changeSign === '-' && v > 100) { setChangePct(100); return }
              setChangePct(v)
            }}
            style={{ ...PICKER_STYLE, width: 64 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span>
        </div>

      </div>

      {/* ── Period picker ── */}
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

      {/* ── Impact banner ── */}
      {!loading && changePct > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {factorLabel} {changeSign}{changePct}%
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>→</span>
          <span style={{
            fontSize: 15, fontWeight: 700,
            color: totalImpact >= 0 ? 'var(--color-success, #22c55e)' : 'var(--color-error, #ef4444)',
          }}>
            {totalImpact >= 0 ? '+' : ''}{fmtMoney(totalImpact)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>profit impact (shown period)</span>
        </div>
      )}

      {/* ── Charts ── */}
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
                data={visibleSimData}
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
