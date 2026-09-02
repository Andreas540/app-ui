// src/components/RpsCharts.tsx
// Shared pickers, data types, fetch, and ChartSlide used by ReportsPage + SimulationsPage.
// SimulationsPage fetches real data via fetchRpsData, applies simulation adjustments,
// then passes the modified points into ChartSlide just like any other data.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { formatMonthYear } from '../lib/time'
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

// ── Picker style & components ─────────────────────────────────────────────────

export const PICKER_STYLE = {
  width: 'auto',   // override global `select { width: 100% }` so pickers stay compact in flex rows
  height: 34, padding: '0 8px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--input, var(--card))', color: 'var(--text)',
} as const

export function MonthPicker({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const opts: { val: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ val, label: formatMonthYear(d) })
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...PICKER_STYLE, minWidth: 130 }}>
      <option value="">{placeholder ?? 'Select...'}</option>
      {opts.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
    </select>
  )
}

export function YearPicker({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => String(currentYear - i))
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...PICKER_STYLE, minWidth: 90 }}>
      <option value="">{placeholder ?? 'Select...'}</option>
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  )
}

// ── Data types & fetch ────────────────────────────────────────────────────────

export type RpsPoint = {
  month: string
  minMonth?: string
  revenue: number
  gross_profit: number
  grossPct: number
  operating_profit: number
  operatingPct: number
  surplus: number
  surplusPct: number
}

export async function fetchRpsData(
  from?: string, to?: string, period: 'month' | 'year' = 'month',
): Promise<RpsPoint[]> {
  const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  let params: string
  if (period === 'year') {
    params = (from && to)
      ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&period=year`
      : 'years=3&period=year'
  } else {
    params = (from && to)
      ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : 'months=3'
  }
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
      minMonth: r.min_month_start ? String(r.min_month_start) : undefined,
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

// ── PartialYearLabel ──────────────────────────────────────────────────────────

export function PartialYearLabel({ x, y, width, value }: any) {
  if (!value) return null
  const parts = String(value).split('-')
  const minMon = parseInt(parts[1] ?? '0', 10)
  if (!minMon || minMon === 1) return null
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mon = MONTHS[minMon - 1]
  return (
    <text
      x={(x ?? 0) + (width ?? 0) / 2}
      y={(y ?? 0) - 22}
      textAnchor="middle"
      fontSize={9}
      fill="var(--text-secondary, #9ca3af)"
    >
      {`From: ${mon}`}
    </text>
  )
}

// ── ChartSlide ────────────────────────────────────────────────────────────────

export const VISIBLE_MOBILE  = 3
export const VISIBLE_DESKTOP = 6

export type ChartSlideProps = {
  data: RpsPoint[]
  showBy?: 'month' | 'year'
  bar1Key: string
  bar1Label: string
  bar2Key: string
  bar2Label: string
  lineKey: string
  computePct?: (row: any) => number
  needsScroll?: boolean
  canPrev?: boolean
  canNext?: boolean
  onPrev?: () => void
  onNext?: () => void
}

export function ChartSlide({
  data, showBy, bar1Key, bar1Label, bar2Key, bar2Label, lineKey, computePct,
  needsScroll, canPrev, canNext, onPrev, onNext,
}: ChartSlideProps) {
  const { t } = useTranslation('reports')
  const { fmtCompact, fmtPct } = useCurrency()
  const [showPct, setShowPct] = useState(false)

  const navBtn = (disabled: boolean) => ({
    width: 32, height: 32, padding: 0, fontSize: 16, fontWeight: 700,
    background: 'transparent' as const,
    border: '1px solid var(--border)', borderRadius: 6,
    color: disabled ? 'var(--text-secondary)' : 'var(--text)',
    opacity: disabled ? 0.3 : 1,
    cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
  })

  const enriched = useMemo(() => {
    if (!computePct) return data
    return (data || []).map((r: any) => ({ ...r, [lineKey]: computePct(r) }))
  }, [data, computePct, lineKey])

  // Hide bar value labels when bars are too narrow to fit text without overlap
  const showLabels = enriched.length <= 9
  // Thin out X-axis ticks when many periods so labels don't overlap
  const xInterval = enriched.length <= 12 ? 0 : enriched.length <= 24 ? 1 : 2

  return (
    <div>
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
          {showPct ? t('hideProfitPct') : t('showProfitPct')}
        </button>
      </div>

      <div style={{ position: 'relative', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={enriched} margin={{ top: 14, right: 0, bottom: 6, left: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
              tickLine={false}
              interval={xInterval}
              tickFormatter={(m) => {
                const [y, mm] = (m || '').split('-').map(Number)
                if (!y || !mm) return String(m || '')
                return formatMonthYear(new Date(y, mm - 1, 1))
              }}
            />
            <YAxis yAxisId="left"  tick={false} axisLine={false} width={0}
              domain={[0, (dataMax: number) => Math.ceil((dataMax || 0) * 1.35)]} />
            <YAxis yAxisId="right" orientation="right" tick={false} axisLine={false} width={0}
              domain={[0, 0.55]} />

            <Bar yAxisId="left" dataKey={bar1Key} fill="#f59e0b" maxBarSize={40} isAnimationActive={false}>
              {showBy === 'year' && (
                <LabelList dataKey="minMonth" content={PartialYearLabel} />
              )}
              {!showPct && showLabels && (
                <LabelList dataKey={bar1Key} position="top" offset={8}
                  formatter={(v: any) => fmtCompact(Number(v))} fill="#fff"
                  style={{ fontSize: 11, fontWeight: 700 }} />
              )}
            </Bar>
            <Bar yAxisId="left" dataKey={bar2Key} fill="#60a5fa" maxBarSize={40} isAnimationActive={false}>
              {!showPct && showLabels && (
                <LabelList dataKey={bar2Key} position="top" offset={8}
                  formatter={(v: any) => fmtCompact(Number(v))} fill="#fff"
                  style={{ fontSize: 11, fontWeight: 700 }} />
              )}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey={lineKey} stroke="#374151"
              strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false}>
              {showPct && showLabels && (
                <LabelList dataKey={lineKey} position="bottom" offset={8}
                  formatter={(v: any) => fmtPct(Number(v) * 100)} fill="#fff"
                  style={{ fontSize: 11, fontWeight: 700 }} />
              )}
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {needsScroll && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          <button disabled={!canPrev} onClick={onPrev} style={navBtn(!canPrev!)}>‹</button>
          <button disabled={!canNext} onClick={onNext} style={navBtn(!canNext!)}>›</button>
        </div>
      )}
    </div>
  )
}

// ── Report definitions ────────────────────────────────────────────────────────

export type ReportDef = {
  id: string
  bar1Key: string
  bar1Label: string
  bar2Key: string
  bar2Label: string
  lineKey: string
}

export const ALL_REPORTS: ReportDef[] = [
  {
    id: 'revenue_gross_profit',
    bar1Key: 'revenue',      bar1Label: 'label_revenue',
    bar2Key: 'gross_profit', bar2Label: 'label_gross_profit',
    lineKey: 'grossPct',
  },
  {
    id: 'revenue_operating_profit',
    bar1Key: 'revenue',          bar1Label: 'label_revenue',
    bar2Key: 'operating_profit', bar2Label: 'label_operating_profit',
    lineKey: 'operatingPct',
  },
]

