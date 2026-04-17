// src/pages/CustomerReportsPage.tsx
// Customer Reports — Customer Ranking with detail modal.
// Header pattern mirrors ReportsPage: date interval selector + report dropdown.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList,
} from 'recharts'
import { getAuthHeaders } from '../lib/api'
import { formatMonthYear } from '../lib/time'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'

// ── Types ─────────────────────────────────────────────────────────────────────

type SortMetric  = 'revenue' | 'profit' | 'profit_pct'
type ChartMetric = 'qty' | 'revenue' | 'profit' | 'profit_pct'

type CustomerRow = {
  customer_id: string
  customer_name: string
  customer_type: string
  revenue: number
  gross_profit: number
  profit_pct: number   // precomputed: gross_profit / revenue
}

type ProductRow = {
  product_id: string
  product_name: string
  qty: number
  revenue: number
  gross_profit: number
  profit_pct: number
}

type Totals = { revenue: number; gross_profit: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$   = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`
const fmtFull$ = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

// ── Month picker ──────────────────────────────────────────────────────────────

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
    opts.push({ val, label: formatMonthYear(d) })
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

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchRanking(from?: string, to?: string): Promise<{ customers: CustomerRow[]; totals: Totals }> {
  const p = new URLSearchParams({ action: 'ranking' })
  if (from) p.set('from', from)
  if (to)   p.set('to',   to)
  const res = await fetch(`${BASE}/api/customer-reports?${p}`, { cache: 'no-store', headers: getAuthHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const customers: CustomerRow[] = (data.customers ?? []).map((r: any) => {
    const revenue      = Number(r.revenue      ?? 0)
    const gross_profit = Number(r.gross_profit ?? 0)
    return {
      customer_id:   String(r.customer_id   ?? ''),
      customer_name: String(r.customer_name ?? ''),
      customer_type: String(r.customer_type ?? ''),
      revenue,
      gross_profit,
      profit_pct: revenue > 0 ? gross_profit / revenue : 0,
    }
  })
  return {
    customers,
    totals: {
      revenue:      Number(data.totals?.revenue      ?? 0),
      gross_profit: Number(data.totals?.gross_profit ?? 0),
    },
  }
}

async function fetchDetail(customerId: string, from?: string, to?: string): Promise<ProductRow[]> {
  const p = new URLSearchParams({ action: 'detail', customer_id: customerId })
  if (from) p.set('from', from)
  if (to)   p.set('to',   to)
  const res = await fetch(`${BASE}/api/customer-reports?${p}`, { cache: 'no-store', headers: getAuthHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.products ?? []).map((r: any) => {
    const revenue      = Number(r.revenue      ?? 0)
    const gross_profit = Number(r.gross_profit ?? 0)
    return {
      product_id:   String(r.product_id   ?? ''),
      product_name: String(r.product_name ?? ''),
      qty:          Number(r.qty          ?? 0),
      revenue,
      gross_profit,
      profit_pct: revenue > 0 ? gross_profit / revenue : 0,
    }
  })
}

// ── Metric toggle ─────────────────────────────────────────────────────────────

function MetricToggle({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{
      display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
      border: '1px solid var(--border)',
    }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 10px', fontSize: 12, height: 28,
            background: value === opt.value ? 'var(--accent, #6366f1)' : 'transparent',
            color: value === opt.value ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            borderRight: i < options.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Customer detail modal ─────────────────────────────────────────────────────

function CustomerDetailModal({ customer, totals, allCustomers, from, to, onClose }: {
  customer: CustomerRow
  totals: Totals
  allCustomers: CustomerRow[]
  from: string
  to: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation('reports')

  function fmtMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    if (!y || !m) return ym
    return new Date(y, m - 1, 1).toLocaleString(i18n.language, { month: 'short', year: 'numeric' })
  }
  const [products,      setProducts]      = useState<ProductRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [chartMetric,   setChartMetric]   = useState<ChartMetric>('qty')
  const [analyzeState,  setAnalyzeState]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [analysis,      setAnalysis]      = useState('')
  const [speaking,      setSpeaking]      = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Compute ranks for all 3 metrics
  const ranks = useMemo(() => {
    const byRev  = [...allCustomers].sort((a, b) => b.revenue      - a.revenue)
    const byPro  = [...allCustomers].sort((a, b) => b.gross_profit - a.gross_profit)
    const byPct  = [...allCustomers].sort((a, b) => b.profit_pct   - a.profit_pct)
    return {
      revenue:    byRev.findIndex(c => c.customer_id === customer.customer_id) + 1,
      profit:     byPro.findIndex(c => c.customer_id === customer.customer_id) + 1,
      profit_pct: byPct.findIndex(c => c.customer_id === customer.customer_id) + 1,
    }
  }, [allCustomers, customer.customer_id])

  useEffect(() => {
    let stop = false
    setLoading(true)
    fetchDetail(customer.customer_id, from || undefined, to || undefined)
      .then(rows => { if (!stop) { setProducts(rows); setLoading(false) } })
      .catch(() => { if (!stop) setLoading(false) })
    return () => { stop = true }
  }, [customer.customer_id, from, to])

  // Keyboard close + speech cleanup on unmount
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.speechSynthesis.cancel()
    }
  }, [onClose])

  async function runAnalyze() {
    setAnalyzeState('loading')
    setSpeaking(false)
    window.speechSynthesis.cancel()
    const p = new URLSearchParams({ action: 'analyze', customer_id: customer.customer_id, lang: i18n.language })
    if (from) p.set('from', from)
    if (to)   p.set('to',   to)
    try {
      const res  = await fetch(`${BASE}/api/customer-reports?${p}`, { cache: 'no-store', headers: getAuthHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setAnalysis(data.analysis ?? '')
      setAnalyzeState('done')
    } catch (err: any) {
      setAnalysis(err?.message ?? String(err))
      setAnalyzeState('error')
    }
  }

  function toggleSpeak() {
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utt  = new SpeechSynthesisUtterance(analysis)
    utt.lang   = i18n.language
    utt.onend  = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    utteranceRef.current = utt
    window.speechSynthesis.speak(utt)
    setSpeaking(true)
  }

  const chartData = useMemo(() => {
    const getVal = (p: ProductRow) =>
      chartMetric === 'qty'        ? p.qty
      : chartMetric === 'revenue'  ? p.revenue
      : chartMetric === 'profit'   ? p.gross_profit
      : p.profit_pct * 100
    return [...products]
      .sort((a, b) => getVal(b) - getVal(a))
      .map(p => ({ name: p.product_name, value: getVal(p) }))
  }, [products, chartMetric])

  const chartFmt = (label: React.ReactNode): React.ReactNode => {
    const v = Number(label)
    if (chartMetric === 'profit_pct') return `${v.toFixed(1)}%`
    if (chartMetric === 'qty')        return String(Math.round(v))
    return fmt$(v)
  }

  const pctRevenue = totals.revenue      > 0 ? customer.revenue      / totals.revenue      : 0
  const pctProfit  = totals.gross_profit > 0 ? customer.gross_profit / totals.gross_profit : 0

  const ranktiles = [
    { label: t('customers.customer_ranking.detail.revenue_rank'),    rank: ranks.revenue },
    { label: t('customers.customer_ranking.detail.profit_rank'),     rank: ranks.profit },
    { label: t('customers.customer_ranking.detail.profit_pct_rank'), rank: ranks.profit_pct },
  ]

  const summaryRows = [
    {
      label: t('customers.customer_ranking.col_revenue'),
      value: fmtFull$(customer.revenue),
      pct: totals.revenue > 0
        ? `${(pctRevenue * 100).toFixed(1)}% ${t('customers.customer_ranking.detail.of_all_revenue')}`
        : '',
    },
    {
      label: t('customers.customer_ranking.col_profit'),
      value: fmtFull$(customer.gross_profit),
      pct: totals.gross_profit > 0
        ? `${(pctProfit * 100).toFixed(1)}% ${t('customers.customer_ranking.detail.of_all_profit')}`
        : '',
    },
    { label: t('customers.customer_ranking.col_profit_pct'), value: fmtPct(customer.profit_pct), pct: '' },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
        padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{customer.customer_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {customer.customer_type && <span>{customer.customer_type}</span>}
              {customer.customer_type && <span> · </span>}
              <span>
                {(from || to)
                  ? `${from ? fmtMonth(from) : '…'} – ${to ? fmtMonth(to) : '…'}`
                  : t('customers.customer_ranking.detail.all_time')
                }
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Rank tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {ranktiles.map(({ label, rank }) => (
            <div key={label} style={{
              background: 'var(--bg, #10131a)', borderRadius: 8,
              border: '1px solid var(--border)', padding: '10px 8px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: rank <= 5 ? '#22c55e' : 'var(--accent, #6366f1)' }}>#{rank}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            {t('customers.customer_ranking.detail.summary')}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {summaryRows.map(row => (
                <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 0', color: 'var(--text-secondary)' }}>{row.label}</td>
                  <td style={{ padding: '7px 0', fontWeight: 600, textAlign: 'right' }}>{row.value}</td>
                  <td style={{ padding: '7px 0 7px 12px', textAlign: 'right' }}>
                    {row.pct && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {row.pct}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Product breakdown */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {t('customers.customer_ranking.detail.product_breakdown')}
            </div>
            <MetricToggle
              value={chartMetric}
              onChange={v => setChartMetric(v as ChartMetric)}
              options={[
                { value: 'qty',        label: t('customers.customer_ranking.by_qty')        },
                { value: 'revenue',    label: t('customers.customer_ranking.by_revenue')    },
                { value: 'profit',     label: t('customers.customer_ranking.by_profit')     },
                { value: 'profit_pct', label: t('customers.customer_ranking.by_profit_pct') },
              ]}
            />
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 13 }}>…</div>
          ) : chartData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 13 }}>—</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(100, chartData.length * 34)}>
              <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category" dataKey="name" width={140}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false} tickLine={false}
                />
                <Bar dataKey="value" fill="var(--accent, #6366f1)" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                  <LabelList
                    dataKey="value" position="right"
                    formatter={chartFmt}
                    style={{ fontSize: 11, fill: 'var(--text)', fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Analyze section ──────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {t('customers.customer_ranking.detail.analysis_title')}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {analyzeState === 'done' && (
                <button
                  onClick={toggleSpeak}
                  title={speaking ? t('customers.customer_ranking.detail.stop_reading') : t('customers.customer_ranking.detail.read_aloud')}
                  style={{
                    height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6,
                    background: speaking ? 'var(--accent, #6366f1)' : 'transparent',
                    color: speaking ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  {speaking ? '⏹ ' + t('customers.customer_ranking.detail.stop_reading')
                            : '🔊 ' + t('customers.customer_ranking.detail.read_aloud')}
                </button>
              )}
              <button
                onClick={runAnalyze}
                disabled={analyzeState === 'loading'}
                style={{
                  height: 28, padding: '0 12px', fontSize: 12, borderRadius: 6,
                  background: 'var(--accent, #6366f1)', color: '#fff',
                  border: 'none', cursor: analyzeState === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: analyzeState === 'loading' ? 0.7 : 1,
                }}
              >
                {analyzeState === 'loading'
                  ? t('customers.customer_ranking.detail.analyzing')
                  : analyzeState === 'done'
                  ? t('customers.customer_ranking.detail.re_analyze')
                  : t('customers.customer_ranking.detail.analyze')}
              </button>
            </div>
          </div>

          {analyzeState === 'done' && (
            <div style={{
              marginTop: 10, padding: '12px 14px', borderRadius: 8,
              background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)',
              fontSize: 13, lineHeight: 1.65, color: 'var(--text)',
            }}>
              {analysis.split(/\n\s*\n/).map((para, i) => {
                const labelMatch = para.match(/^(Analysis:|Recommendations:)([\s\S]*)$/i)
                if (labelMatch) {
                  return (
                    <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>
                      <strong>{labelMatch[1]}</strong>{labelMatch[2]}
                    </p>
                  )
                }
                return <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>{para}</p>
              })}
            </div>
          )}

          {analyzeState === 'error' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'salmon' }}>
              {analysis}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Ranking card ──────────────────────────────────────────────────────────────

function RankingCard({ customers, totals, from, to }: {
  customers: CustomerRow[]
  totals: Totals
  from: string
  to: string
}) {
  const { t }             = useTranslation('reports')
  const [sortMetric, setSortMetric] = useState<SortMetric>('revenue')
  const [selected,   setSelected]   = useState<CustomerRow | null>(null)

  const sorted = useMemo(() => [...customers].sort((a, b) => {
    if (sortMetric === 'revenue')    return b.revenue      - a.revenue
    if (sortMetric === 'profit')     return b.gross_profit - a.gross_profit
    return b.profit_pct - a.profit_pct
  }), [customers, sortMetric])

  const valueHeader =
    sortMetric === 'revenue'    ? t('customers.customer_ranking.col_revenue')    :
    sortMetric === 'profit'     ? t('customers.customer_ranking.col_profit')     :
                                  t('customers.customer_ranking.col_profit_pct')

  const getValue = (c: CustomerRow) =>
    sortMetric === 'revenue'    ? fmt$(c.revenue)      :
    sortMetric === 'profit'     ? fmt$(c.gross_profit) :
                                  fmtPct(c.profit_pct)

  const th: React.CSSProperties = {
    padding: '7px 8px', textAlign: 'left', fontWeight: 600,
    fontSize: 11, color: 'var(--text-secondary)',
    borderBottom: '2px solid var(--border)',
  }

  return (
    <>
      <div className="card" style={{ padding: '12px 16px 16px' }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{t('customers.customer_ranking.title')}</span>
          <MetricToggle
            value={sortMetric}
            onChange={v => setSortMetric(v as SortMetric)}
            options={[
              { value: 'revenue',    label: t('customers.customer_ranking.by_revenue')    },
              { value: 'profit',     label: t('customers.customer_ranking.by_profit')     },
              { value: 'profit_pct', label: t('customers.customer_ranking.by_profit_pct') },
            ]}
          />
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 32 }}>{t('customers.customer_ranking.col_rank')}</th>
                <th style={th}>{t('customers.customer_ranking.col_customer')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{valueHeader}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, idx) => (
                <tr
                  key={c.customer_id}
                  onClick={() => setSelected(c)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}
                >
                  <td style={{ padding: '8px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ fontWeight: 500 }}>{c.customer_name}</div>
                    {c.customer_type && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.customer_type}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{getValue(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <CustomerDetailModal
          customer={selected}
          totals={totals}
          allCustomers={customers}
          from={from}
          to={to}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

// ── Report definitions (extensible) ──────────────────────────────────────────

const ALL_REPORTS = [{ id: 'customer_ranking' }]
const LS_HIDDEN   = 'customer_reports_hidden'

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

export default function CustomerReportsPage() {
  const { t }  = useTranslation('reports')
  const { t: tc } = useTranslation()
  const { user } = useAuth()
  // showInfoIcons kept for future info overlays — not used in ranking yet
  void getTenantConfig(user?.tenantId).ui.showInfoIconsReports

  const [customers,    setCustomers]    = useState<CustomerRow[]>([])
  const [totals,       setTotals]       = useState<Totals>({ revenue: 0, gross_profit: 0 })
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [visible,      setVisible]      = useState<string[]>(loadVisible)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [fromMonth,    setFromMonth]    = useState('')
  const [toMonth,      setToMonth]      = useState('')

  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr(null)
    fetchRanking(fromMonth || undefined, toMonth || undefined)
      .then(({ customers: rows, totals: t }) => {
        if (stop) return
        setCustomers(rows)
        setTotals(t)
        setLoading(false)
      })
      .catch((e: any) => { if (!stop) { setErr(e?.message || String(e)); setLoading(false) } })
    return () => { stop = true }
  }, [fromMonth, toMonth])

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

  const showRanking = visible.includes('customer_ranking')

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── Header card ────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t('customers.pageTitle')}</h3>

          {/* Report selector dropdown */}
          <div>
            <button
              ref={btnRef}
              onClick={() => setDropdownOpen(o => !o)}
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
            >
              {t('customers.pageTitle')} ▾
            </button>
            {dropdownOpen && (() => {
              const rect     = btnRef.current?.getBoundingClientRect()
              const rawRight = rect ? window.innerWidth - rect.right : 16
              const right    = Math.max(8, rawRight)
              const top      = rect ? rect.bottom + 4 : 60
              return (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setDropdownOpen(false)} />
                  <div style={{
                    position: 'fixed', top, right, width: 220,
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
                        <span style={{ fontSize: 13 }}>{t(`customers.customer_ranking.title`)}</span>
                      </label>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* Period picker */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 14, flexWrap: 'wrap', rowGap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{t('from')}</div>
            <MonthPicker value={fromMonth} onChange={handleFromChange} placeholder={t('from')} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3 }}>{t('to')}</div>
            <MonthPicker value={toMonth} onChange={setToMonth} placeholder={t('to')} />
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

      {/* Status */}
      {err     && <div className="card"><p style={{ color: 'salmon' }}>{tc('error')}: {err}</p></div>}
      {loading && <div className="card"><p className="helper">{tc('loadingDots')}</p></div>}

      {!loading && !showRanking && (
        <div className="card">
          <p className="helper">{t('noReportsSelected')}</p>
        </div>
      )}

      {/* Ranking card */}
      {!loading && showRanking && (
        <RankingCard customers={customers} totals={totals} from={fromMonth} to={toMonth} />
      )}
    </div>
  )
}
