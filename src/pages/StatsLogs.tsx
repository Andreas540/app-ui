// src/pages/StatsLogs.tsx
// SuperAdmin-only activity dashboard.
// Global view: one chart per tenant.  Tenant view: one chart per user.
// 24h: 96 × 15-min stacked bars in a multi-column grid.
// 7d:  168 × 1-hour simple bars, one full-width row per entity.
// 30d: 30  × 1-day  simple bars, one full-width row per entity.
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

// ─── Action colours ──────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  login_success:                '#4ade80',
  login_failed:                 '#f87171',
  login_failed_user_not_found:  '#fb923c',
  login_blocked_blacklist:      '#dc2626',
  login_blocked_disabled:       '#c084fc',
  password_change:              '#60a5fa',
  password_change_failed:       '#f97316',
}

const FALLBACK_PALETTE = [
  '#a3e635', '#34d399', '#22d3ee', '#818cf8',
  '#f472b6', '#fbbf24', '#e879f9', '#84cc16',
  '#2dd4bf', '#38bdf8', '#fb7185',
]

const ERROR_KEYWORD_COLORS: Array<[RegExp, string]> = [
  [/failed|failure/,              '#f87171'],
  [/blocked|denied|forbidden/,    '#dc2626'],
  [/unauthorized|auth/,           '#c084fc'],
  [/expired|timeout/,             '#fb923c'],
  [/invalid/,                     '#fbbf24'],
  [/error|exception/,             '#f97316'],
  [/limit|throttl/,               '#e879f9'],
]

function isErrorAction(action: string): boolean {
  return ERROR_KEYWORD_COLORS.some(([pattern]) => pattern.test(action))
}

function actionLabel(action: string): string {
  const stripped = action.startsWith('page_view_') ? action.slice('page_view_'.length) : action
  return stripped.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function actionColor(action: string): string {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action]
  for (const [pattern, color] of ERROR_KEYWORD_COLORS) {
    if (pattern.test(action)) return color
  }
  let h = 0
  for (let i = 0; i < action.length; i++) { h = ((h << 5) - h) + action.charCodeAt(i); h |= 0 }
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length]
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '24h' | '7d' | '30d'
interface ActivityRow { bucket_index: number; action: string; count: number }
interface Entity      { id: string; name: string; total: number; rows: ActivityRow[] }
interface StatsData   {
  view: 'global' | 'tenant'
  period: string
  window_start: string
  bucket_count: number
  bucket_sec: number
  tz: string
  entities: Entity[]
}
type SortOrder = 'activity' | 'name'
type ReportTab = 'activity' | 'errors' | 'website'

const PERIOD_LABELS: Record<Period, string> = { '24h': '24h', '7d': '7d', '30d': '30d' }
const PERIOD_CFG: Record<Period, { bucketCount: number; bucketSec: number }> = {
  '24h': { bucketCount: 96,  bucketSec: 900 },
  '7d':  { bucketCount: 168, bucketSec: 3600 },
  '30d': { bucketCount: 30,  bucketSec: 86400 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBucketLabel(t: Date, tz: string, bucketSec: number): string {
  if (bucketSec < 3600) {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).format(t)
  } else if (bucketSec < 86400) {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', hour: '2-digit', hour12: false, timeZone: tz,
    }).format(t).replace(',', '')
  } else {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: tz,
    }).format(t)
  }
}

function buildChartData(
  entity: Entity,
  windowStart: Date,
  tz: string,
  allActions: string[],
  bucketCount: number,
  bucketSec: number,
): Record<string, any>[] {
  const data = Array.from({ length: bucketCount }, (_, i) => {
    const t = new Date(windowStart.getTime() + i * bucketSec * 1000)
    const point: Record<string, any> = { time: formatBucketLabel(t, tz, bucketSec) }
    allActions.forEach(a => { point[a] = 0 })
    return point
  })
  entity.rows.forEach(r => {
    const i = r.bucket_index
    if (i >= 0 && i < bucketCount) data[i][r.action] = (data[i][r.action] || 0) + r.count
  })
  return data
}

function buildSimpleData(
  entity: Entity,
  windowStart: Date,
  tz: string,
  bucketCount: number,
  bucketSec: number,
): { time: string; total: number }[] {
  const data = Array.from({ length: bucketCount }, (_, i) => {
    const t = new Date(windowStart.getTime() + i * bucketSec * 1000)
    return { time: formatBucketLabel(t, tz, bucketSec), total: 0 }
  })
  entity.rows.forEach(r => {
    const i = r.bucket_index
    if (i >= 0 && i < bucketCount) data[i].total += r.count
  })
  return data
}

function XTick({ x, y, payload, index, step = 8 }: any) {
  if (index % step !== 0) return null
  return (
    <text x={x} y={y + 10} textAnchor="middle" fontSize={8} fill="#9ca3af">
      {payload.value}
    </text>
  )
}

function YTick({ x, y, payload }: any) {
  return (
    <text x={x} y={y + 3} textAnchor="end" fontSize={8} fill="#9ca3af">
      {payload.value}
    </text>
  )
}

function ActivityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const items = (payload as any[]).filter(p => p.value > 0)
  if (!items.length) return null
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 10px', fontSize: 12, maxWidth: 220,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {items.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: p.fill }}>{actionLabel(p.dataKey)}</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function SimpleTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = (payload[0]?.value as number) ?? 0
  if (!total) return null
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '6px 10px', fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div>{total} action{total !== 1 ? 's' : ''}</div>
    </div>
  )
}

// ─── Per-entity chart card ────────────────────────────────────────────────────

function EntityChart({
  entity, windowStart, tz, allActions, bucketCount, bucketSec, mode,
}: {
  entity: Entity; windowStart: Date; tz: string; allActions: string[]
  bucketCount: number; bucketSec: number; mode: '24h' | 'extended'
}) {
  if (mode === 'extended') {
    const simpleData = buildSimpleData(entity, windowStart, tz, bucketCount, bucketSec)
    const tickStep   = bucketSec >= 86400 ? 5 : 24
    const minWidth   = Math.max(300, bucketCount * (bucketSec >= 86400 ? 14 : 5))
    return (
      <div className="card" style={{ padding: '12px 12px 8px 12px' }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{entity.name}</div>
          <div className="helper" style={{ fontSize: 11, marginTop: 2 }}>
            {entity.total.toLocaleString()} actions
          </div>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <div style={{ minWidth }}>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={simpleData} margin={{ top: 2, right: 0, bottom: 14, left: 0 }} barCategoryGap={2}>
                <XAxis
                  dataKey="time"
                  tick={<XTick step={tickStep} />}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis allowDecimals={false} width={24} tick={<YTick />} tickLine={false} axisLine={false} />
                <Tooltip content={<SimpleTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="total" fill="#60a5fa" isAnimationActive={false} radius={[1, 1, 0, 0] as any} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }

  const chartData     = buildChartData(entity, windowStart, tz, allActions, bucketCount, bucketSec)
  const activeActions = allActions.filter(a => entity.rows.some(r => r.action === a))
  return (
    <div className="card" style={{ padding: '12px 12px 8px 12px' }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entity.name}
        </div>
        <div className="helper" style={{ fontSize: 11, marginTop: 2 }}>
          {entity.total.toLocaleString()} action{entity.total !== 1 ? 's' : ''} · 24h
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginBottom: 6 }}>
        {activeActions.map(a => (
          <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 1, background: actionColor(a), flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{actionLabel(a)}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ top: 2, right: 0, bottom: 14, left: 0 }} barCategoryGap={0} barGap={0}>
          <XAxis dataKey="time" tick={<XTick />} tickLine={false} axisLine={false} interval={0} />
          <YAxis allowDecimals={false} width={24} tick={<YTick />} tickLine={false} axisLine={false} />
          <Tooltip content={<ActivityTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          {allActions.map(a => (
            <Bar key={a} dataKey={a} stackId="s" fill={actionColor(a)} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Period selector ──────────────────────────────────────────────────────────

function PeriodSelector({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p, i, arr) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            height: 36,
            padding: '0 14px',
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRight: i < arr.length - 1 ? 'none' : undefined,
            borderRadius: i === 0 ? '6px 0 0 6px' : i === arr.length - 1 ? '0 6px 6px 0' : 0,
            background: period === p ? 'var(--primary)' : 'transparent',
            color: period === p ? '#fff' : 'inherit',
            cursor: 'pointer',
          }}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

// ─── Controls bar (shared between activity + errors tabs) ─────────────────────

function ControlsBar({
  sortOrder, onSortChange, period, onPeriodChange, loading, data, lastRefresh, onRefresh,
}: {
  sortOrder: SortOrder
  onSortChange: (s: SortOrder) => void
  period: Period
  onPeriodChange: (p: Period) => void
  loading: boolean
  data: StatsData | null
  lastRefresh: Date | null
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="helper" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{t('sort')}:</span>
        <select value={sortOrder} onChange={e => onSortChange(e.target.value as SortOrder)} style={{ height: 36 }}>
          <option value="activity">Activity</option>
          <option value="name">Name</option>
        </select>
      </div>

      <PeriodSelector period={period} onChange={onPeriodChange} />

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {loading && data && <span className="helper" style={{ fontSize: 12 }}>Refreshing…</span>}
        {lastRefresh && !loading && (
          <span className="helper" style={{ fontSize: 12 }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button onClick={onRefresh} style={{ height: 32, padding: '0 12px', fontSize: 13 }}>↺</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StatsLogs() {
  const { t } = useTranslation()
  const [activeReport, setActiveReport] = useState<ReportTab>('activity')
  const [sortOrder,    setSortOrder]    = useState<SortOrder>('activity')
  const [period,       setPeriod]       = useState<Period>('24h')
  const [data,         setData]         = useState<StatsData | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [err,          setErr]          = useState<string | null>(null)
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null)

  const [websiteData,    setWebsiteData]    = useState<StatsData | null>(null)
  const [websiteLoading, setWebsiteLoading] = useState(false)
  const [websiteErr,     setWebsiteErr]     = useState<string | null>(null)

  const activeTenantId = localStorage.getItem('activeTenantId')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const base   = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const params = new URLSearchParams({ period })
      if (activeTenantId) params.set('tenant_id', activeTenantId)
      const res = await fetch(`${base}/api/activity-stats?${params}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`)
      setData(await res.json())
      setLastRefresh(new Date())
      setErr(null)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [activeTenantId, period])

  useEffect(() => {
    loadData()
    if (period !== '24h') return
    const id = setInterval(loadData, 30_000)
    return () => clearInterval(id)
  }, [loadData])

  const loadWebsiteData = useCallback(async () => {
    try {
      setWebsiteLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res  = await fetch(`${base}/api/website-stats`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`Failed to load website stats (${res.status})`)
      setWebsiteData(await res.json())
      setWebsiteErr(null)
    } catch (e: any) {
      setWebsiteErr(e?.message || String(e))
    } finally {
      setWebsiteLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeReport !== 'website') return
    loadWebsiteData()
    const id = setInterval(loadWebsiteData, 30_000)
    return () => clearInterval(id)
  }, [activeReport, loadWebsiteData])

  // ── Derived data ─────────────────────────────────────────────────────────────
  // Use data only when its period matches the selected period (avoids stale chart flash)
  const effectiveData = data?.period === period ? data : null

  const { bucketCount, bucketSec } = PERIOD_CFG[period]
  const chartMode = period === '24h' ? '24h' as const : 'extended' as const
  const isExtended = period !== '24h'

  const allActions = (() => {
    if (!effectiveData) return []
    const set = new Set<string>()
    effectiveData.entities.forEach(e => e.rows.forEach(r => set.add(r.action)))
    return Array.from(set)
  })()

  const sortedEntities = effectiveData
    ? [...effectiveData.entities].sort((a, b) =>
        sortOrder === 'name' ? a.name.localeCompare(b.name) : b.total - a.total,
      )
    : []

  const windowStart = effectiveData ? new Date(effectiveData.window_start) : new Date()
  const tz          = effectiveData?.tz ?? 'UTC'

  const errorActions = allActions.filter(a => isErrorAction(a))
  const errorEntities: Entity[] = effectiveData
    ? effectiveData.entities
        .map(e => ({
          ...e,
          rows:  e.rows.filter(r => isErrorAction(r.action)),
          total: e.rows.filter(r => isErrorAction(r.action)).reduce((s, r) => s + r.count, 0),
        }))
        .filter(e => e.total > 0)
    : []
  const sortedErrorEntities = [...errorEntities].sort((a, b) =>
    sortOrder === 'name' ? a.name.localeCompare(b.name) : b.total - a.total,
  )

  const CONTROL_H = 44
  const gridStyle = {
    display: 'grid' as const,
    gridTemplateColumns: isExtended ? '1fr' : 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
    gap: 12,
  }
  const noDataPeriod = PERIOD_LABELS[period]

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page-wide">
      {/* ── Top card: report buttons ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px 0' }}>Stats &amp; Logs</h3>
        <p className="helper" style={{ margin: '0 0 16px 0', fontSize: 12 }}>
          Stats shown in Tenants/Users time zone
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={activeReport === 'activity' ? 'primary' : undefined}
            onClick={() => setActiveReport('activity')}
            style={{ height: CONTROL_H, minWidth: 120 }}
          >
            Activity
          </button>
          <button
            className={activeReport === 'errors' ? 'primary' : undefined}
            onClick={() => setActiveReport('errors')}
            style={{ height: CONTROL_H, minWidth: 120 }}
          >
            Errors
          </button>
          <button
            className={activeReport === 'website' ? 'primary' : undefined}
            onClick={() => setActiveReport('website')}
            style={{ height: CONTROL_H, minWidth: 120 }}
          >
            Website
          </button>
        </div>
      </div>

      {/* ── Activity report ─────────────────────────────────────────────── */}
      {activeReport === 'activity' && (
        <>
          <ControlsBar
            sortOrder={sortOrder} onSortChange={setSortOrder}
            period={period} onPeriodChange={setPeriod}
            loading={loading} data={data} lastRefresh={lastRefresh} onRefresh={loadData}
          />

          {err && (
            <div className="card">
              <p style={{ color: 'var(--color-error)' }}>{t('error')}: {err}</p>
            </div>
          )}

          {(loading && !effectiveData) && (
            <div className="card"><p>{t('loading')}</p></div>
          )}

          {effectiveData && sortedEntities.length === 0 && (
            <div className="card">
              <p className="helper">No activity in the last {noDataPeriod}.</p>
            </div>
          )}

          {effectiveData && sortedEntities.length > 0 && (
            <div style={gridStyle}>
              {sortedEntities.map(entity => (
                <EntityChart
                  key={entity.id}
                  entity={entity}
                  windowStart={windowStart}
                  tz={tz}
                  allActions={allActions}
                  bucketCount={bucketCount}
                  bucketSec={bucketSec}
                  mode={chartMode}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Errors report ───────────────────────────────────────────────── */}
      {activeReport === 'errors' && (
        <>
          <ControlsBar
            sortOrder={sortOrder} onSortChange={setSortOrder}
            period={period} onPeriodChange={setPeriod}
            loading={loading} data={data} lastRefresh={lastRefresh} onRefresh={loadData}
          />

          {err && (
            <div className="card">
              <p style={{ color: 'var(--color-error)' }}>{t('error')}: {err}</p>
            </div>
          )}

          {(loading && !effectiveData) && (
            <div className="card"><p>{t('loading')}</p></div>
          )}

          {effectiveData && sortedErrorEntities.length === 0 && (
            <div className="card">
              <p className="helper">No errors in the last {noDataPeriod}.</p>
            </div>
          )}

          {effectiveData && sortedErrorEntities.length > 0 && (
            <div style={gridStyle}>
              {sortedErrorEntities.map(entity => (
                <EntityChart
                  key={entity.id}
                  entity={entity}
                  windowStart={windowStart}
                  tz={tz}
                  allActions={errorActions}
                  bucketCount={bucketCount}
                  bucketSec={bucketSec}
                  mode={chartMode}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Website report ───────────────────────────────────────────────── */}
      {activeReport === 'website' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {websiteLoading && websiteData && (
              <span className="helper" style={{ fontSize: 12 }}>Refreshing…</span>
            )}
            <button onClick={loadWebsiteData} style={{ height: 32, padding: '0 12px', fontSize: 13 }}>↺</button>
          </div>

          {websiteErr && (
            <div className="card">
              <p style={{ color: 'var(--color-error)' }}>{t('error')}: {websiteErr}</p>
            </div>
          )}

          {websiteLoading && !websiteData && (
            <div className="card"><p>{t('loading')}</p></div>
          )}

          {websiteData && websiteData.entities[0]?.total === 0 && (
            <div className="card">
              <p className="helper">No website events in the last 24 hours.</p>
            </div>
          )}

          {websiteData && websiteData.entities[0]?.total > 0 && (() => {
            const entity        = websiteData.entities[0]
            const ws            = new Date(websiteData.window_start)
            const websiteActions = Array.from(new Set(entity.rows.map(r => r.action)))
            return (
              <EntityChart
                entity={entity}
                windowStart={ws}
                tz="UTC"
                allActions={websiteActions}
                bucketCount={96}
                bucketSec={900}
                mode="24h"
              />
            )
          })()}
        </>
      )}
    </div>
  )
}
