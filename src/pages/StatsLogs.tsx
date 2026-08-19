// src/pages/StatsLogs.tsx
// SuperAdmin-only activity dashboard.
// Global view: one chart per tenant.  Tenant view: one chart per user.
// Slider selects window from 1h to 3 months; bucket strategy auto-selected:
//   ≤24h  → 15-min stacked bars in a grid
//   >24h–7d → hourly simple bars, full-width rows
//   >7d   → daily simple bars, full-width rows
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

// ─── Period slider ────────────────────────────────────────────────────────────

// Stepped values in hours. The slider index maps to these.
const STEPS         = [1, 3, 6, 12, 24, 48, 72, 168, 336, 720, 2160]
const STEP_LABELS   = ['1h', '3h', '6h', '12h', '24h', '2d', '3d', '7d', '14d', '30d', '3mo']
const STEP_DISPLAY  = ['1 hour', '3 hours', '6 hours', '12 hours', '24 hours', '2 days', '3 days', '7 days', '14 days', '30 days', '3 months']
const DEFAULT_STEP  = 4  // index for 24h

function getConfig(hours: number): { bucketSec: number; bucketCount: number; mode: '24h' | 'extended' } {
  if (hours <= 24)  return { bucketSec: 900,   bucketCount: hours * 4,        mode: '24h' }
  if (hours <= 168) return { bucketSec: 3600,  bucketCount: hours,            mode: 'extended' }
  return                   { bucketSec: 86400, bucketCount: Math.ceil(hours / 24), mode: 'extended' }
}

function getTickStep(bucketCount: number, bucketSec: number): number {
  if (bucketSec < 3600)  return 8    // 15-min → label every 2h
  if (bucketSec < 86400) return 24   // 1-hour → label every day
  if (bucketCount <= 14) return 2    // daily ≤14d → every 2 days
  if (bucketCount <= 31) return 5    // daily ≤31d → every 5 days
  return 7                           // daily >31d → every week
}

const SLIDER_CSS = `
  .stats-period-slider {
    -webkit-appearance: none; appearance: none;
    height: 4px; border-radius: 2px;
    background: var(--border, #e5e7eb);
    outline: none; cursor: pointer;
  }
  .stats-period-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--primary, #3b82f6);
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,.25);
    cursor: pointer;
  }
  .stats-period-slider::-moz-range-thumb {
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--primary, #3b82f6);
    border: none;
    box-shadow: 0 1px 4px rgba(0,0,0,.25);
    cursor: pointer;
  }
`

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityRow { bucket_index: number; action: string; count: number }
interface Entity      { id: string; name: string; total: number; rows: ActivityRow[] }
interface StatsData   {
  view: 'global' | 'tenant'
  hours: number
  window_start: string
  bucket_count: number
  bucket_sec: number
  tz: string
  entities: Entity[]
}
type SortOrder = 'activity' | 'name'
type ReportTab = 'activity' | 'errors' | 'website'

// ─── Chart helpers ────────────────────────────────────────────────────────────

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
  entity: Entity, windowStart: Date, tz: string,
  allActions: string[], bucketCount: number, bucketSec: number,
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
  entity: Entity, windowStart: Date, tz: string,
  bucketCount: number, bucketSec: number,
): { time: string; total: number }[] {
  const data = Array.from({ length: bucketCount }, (_, i) => ({
    time: formatBucketLabel(new Date(windowStart.getTime() + i * bucketSec * 1000), tz, bucketSec),
    total: 0,
  }))
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
    const tStep      = getTickStep(bucketCount, bucketSec)
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
                <XAxis dataKey="time" tick={<XTick step={tStep} />} tickLine={false} axisLine={false} interval={0} />
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
  const tStep         = getTickStep(bucketCount, bucketSec)
  return (
    <div className="card" style={{ padding: '12px 12px 8px 12px' }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entity.name}
        </div>
        <div className="helper" style={{ fontSize: 11, marginTop: 2 }}>
          {entity.total.toLocaleString()} action{entity.total !== 1 ? 's' : ''}
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
          <XAxis dataKey="time" tick={<XTick step={tStep} />} tickLine={false} axisLine={false} interval={0} />
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

// ─── Controls bar ─────────────────────────────────────────────────────────────

function ControlsBar({
  sortOrder, onSortChange,
  sliderIdx, onSliderChange,
  loading, data, lastRefresh, onRefresh,
}: {
  sortOrder: SortOrder
  onSortChange: (s: SortOrder) => void
  sliderIdx: number
  onSliderChange: (i: number) => void
  loading: boolean
  data: StatsData | null
  lastRefresh: Date | null
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <style dangerouslySetInnerHTML={{ __html: SLIDER_CSS }} />

      {/* Sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="helper" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{t('sort')}:</span>
        <select value={sortOrder} onChange={e => onSortChange(e.target.value as SortOrder)} style={{ height: 36 }}>
          <option value="activity">Activity</option>
          <option value="name">Name</option>
        </select>
      </div>

      {/* Period slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {STEP_LABELS[0]}
        </span>
        <input
          type="range"
          min={0}
          max={STEPS.length - 1}
          value={sliderIdx}
          onChange={e => onSliderChange(Number(e.target.value))}
          className="stats-period-slider"
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {STEP_LABELS[STEPS.length - 1]}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 72 }}>
          Last {STEP_DISPLAY[sliderIdx]}
        </span>
      </div>

      {/* Refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {loading && data && <span className="helper" style={{ fontSize: 12 }}>Refreshing…</span>}
        {lastRefresh && !loading && (
          <span className="helper" style={{ fontSize: 12 }}>
            {lastRefresh.toLocaleTimeString()}
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

  // sliderIdx is what the slider shows (updates instantly on drag).
  // fetchIdx is debounced: triggers the actual API call.
  const [sliderIdx, setSliderIdx] = useState(DEFAULT_STEP)
  const [fetchIdx,  setFetchIdx]  = useState(DEFAULT_STEP)

  useEffect(() => {
    const t = setTimeout(() => setFetchIdx(sliderIdx), 350)
    return () => clearTimeout(t)
  }, [sliderIdx])

  const [data,        setData]        = useState<StatsData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [err,         setErr]         = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const [websiteData,    setWebsiteData]    = useState<StatsData | null>(null)
  const [websiteLoading, setWebsiteLoading] = useState(false)
  const [websiteErr,     setWebsiteErr]     = useState<string | null>(null)

  const activeTenantId = localStorage.getItem('activeTenantId')
  const hours          = STEPS[fetchIdx]

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const base   = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const params = new URLSearchParams({ hours: String(hours) })
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
  }, [activeTenantId, hours])

  // Auto-refresh only for the 24h window; longer periods change slowly
  useEffect(() => {
    loadData()
    if (hours > 24) return
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

  // Guard against showing data from a previous period while a new fetch is in flight
  const effectiveData = data?.hours === hours ? data : null

  const { bucketSec, bucketCount, mode: chartMode } = getConfig(hours)
  const isExtended = chartMode === 'extended'

  const allActions = (() => {
    if (!effectiveData) return []
    const set = new Set<string>()
    effectiveData.entities.forEach(e => e.rows.forEach(r => set.add(r.action)))
    return Array.from(set)
  })()

  const sortedEntities = effectiveData
    ? [...effectiveData.entities].sort((a, b) =>
        sortOrder === 'name' ? a.name.localeCompare(b.name) : b.total - a.total)
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
    sortOrder === 'name' ? a.name.localeCompare(b.name) : b.total - a.total)

  const CONTROL_H = 44
  const gridStyle = {
    display: 'grid' as const,
    gridTemplateColumns: isExtended ? '1fr' : 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
    gap: 12,
  }
  const noDataLabel = `last ${STEP_DISPLAY[sliderIdx]}`

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page-wide">
      {/* ── Report tabs ────────────────────────────────────────────────── */}
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
            sliderIdx={sliderIdx} onSliderChange={setSliderIdx}
            loading={loading} data={data} lastRefresh={lastRefresh} onRefresh={loadData}
          />

          {err && <div className="card"><p style={{ color: 'var(--color-error)' }}>{t('error')}: {err}</p></div>}
          {loading && !effectiveData && <div className="card"><p>{t('loading')}</p></div>}
          {effectiveData && sortedEntities.length === 0 && (
            <div className="card"><p className="helper">No activity in the {noDataLabel}.</p></div>
          )}
          {effectiveData && sortedEntities.length > 0 && (
            <div style={gridStyle}>
              {sortedEntities.map(entity => (
                <EntityChart
                  key={entity.id} entity={entity} windowStart={windowStart} tz={tz}
                  allActions={allActions} bucketCount={bucketCount} bucketSec={bucketSec} mode={chartMode}
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
            sliderIdx={sliderIdx} onSliderChange={setSliderIdx}
            loading={loading} data={data} lastRefresh={lastRefresh} onRefresh={loadData}
          />

          {err && <div className="card"><p style={{ color: 'var(--color-error)' }}>{t('error')}: {err}</p></div>}
          {loading && !effectiveData && <div className="card"><p>{t('loading')}</p></div>}
          {effectiveData && sortedErrorEntities.length === 0 && (
            <div className="card"><p className="helper">No errors in the {noDataLabel}.</p></div>
          )}
          {effectiveData && sortedErrorEntities.length > 0 && (
            <div style={gridStyle}>
              {sortedErrorEntities.map(entity => (
                <EntityChart
                  key={entity.id} entity={entity} windowStart={windowStart} tz={tz}
                  allActions={errorActions} bucketCount={bucketCount} bucketSec={bucketSec} mode={chartMode}
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
            {websiteLoading && websiteData && <span className="helper" style={{ fontSize: 12 }}>Refreshing…</span>}
            <button onClick={loadWebsiteData} style={{ height: 32, padding: '0 12px', fontSize: 13 }}>↺</button>
          </div>

          {websiteErr && <div className="card"><p style={{ color: 'var(--color-error)' }}>{t('error')}: {websiteErr}</p></div>}
          {websiteLoading && !websiteData && <div className="card"><p>{t('loading')}</p></div>}
          {websiteData && websiteData.entities[0]?.total === 0 && (
            <div className="card"><p className="helper">No website events in the last 24 hours.</p></div>
          )}
          {websiteData && websiteData.entities[0]?.total > 0 && (() => {
            const entity         = websiteData.entities[0]
            const ws             = new Date(websiteData.window_start)
            const websiteActions = Array.from(new Set(entity.rows.map(r => r.action)))
            return (
              <EntityChart
                entity={entity} windowStart={ws} tz="UTC"
                allActions={websiteActions} bucketCount={96} bucketSec={900} mode="24h"
              />
            )
          })()}
        </>
      )}
    </div>
  )
}
