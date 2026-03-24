// src/pages/StatsLogs.tsx
// SuperAdmin-only activity dashboard.
// Global view  (no activeTenantId): one stacked bar chart per tenant.
// Tenant view  (activeTenantId set): one stacked bar chart per user.
// X-axis: 96 buckets × 15 min = rolling 24-hour window.
// Auto-refreshes every 30 seconds.
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

function actionColor(action: string): string {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action]
  let h = 0
  for (let i = 0; i < action.length; i++) { h = ((h << 5) - h) + action.charCodeAt(i); h |= 0 }
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length]
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityRow { bucket_index: number; action: string; count: number }
interface Entity      { id: string; name: string; total: number; rows: ActivityRow[] }
interface StatsData   { view: 'global' | 'tenant'; window_start: string; tz: string; entities: Entity[] }
type SortOrder = 'activity' | 'name'
type ReportTab = 'activity' | 'placeholder1' | 'placeholder2'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a 96-slot array of chart data points, one per 15-min bucket. */
function buildChartData(
  entity: Entity,
  windowStart: Date,
  tz: string,
  allActions: string[],
): Record<string, any>[] {
  const data = Array.from({ length: 96 }, (_, i) => {
    const t = new Date(windowStart.getTime() + i * 15 * 60 * 1000)
    const label = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).format(t)
    const point: Record<string, any> = { time: label }
    allActions.forEach(a => { point[a] = 0 })
    return point
  })
  entity.rows.forEach(r => {
    const i = r.bucket_index
    if (i >= 0 && i < 96) data[i][r.action] = (data[i][r.action] || 0) + r.count
  })
  return data
}

/** Custom X-axis tick — renders only every 8th bucket (every 2 hours). */
function XTick({ x, y, payload, index }: any) {
  if (index % 8 !== 0) return null
  return (
    <text x={x} y={y + 10} textAnchor="middle" fontSize={8} fill="var(--text-secondary)">
      {payload.value}
    </text>
  )
}

/** Tooltip showing only actions with count > 0. */
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
          <span style={{ color: p.fill }}>{p.dataKey.replace(/_/g, ' ')}</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Per-entity chart card ────────────────────────────────────────────────────

function EntityChart({
  entity, windowStart, tz, allActions,
}: {
  entity: Entity; windowStart: Date; tz: string; allActions: string[]
}) {
  const chartData = buildChartData(entity, windowStart, tz, allActions)
  const activeActions = allActions.filter(a => entity.rows.some(r => r.action === a))

  return (
    <div className="card" style={{ padding: '12px 12px 8px 12px' }}>
      {/* Card header */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entity.name}
        </div>
        <div className="helper" style={{ fontSize: 11, marginTop: 2 }}>
          {entity.total.toLocaleString()} action{entity.total !== 1 ? 's' : ''} · 24h
        </div>
      </div>

      {/* Legend: only actions that appear in this entity */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginBottom: 6 }}>
        {activeActions.map(a => (
          <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 1, background: actionColor(a), flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{a.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ top: 2, right: 0, bottom: 14, left: 0 }} barCategoryGap={0} barGap={0}>
          <XAxis
            dataKey="time"
            tick={<XTick />}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            width={24}
            tick={{ fontSize: 8, fill: 'var(--text-secondary)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ActivityTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          {allActions.map(a => (
            <Bar key={a} dataKey={a} stackId="s" fill={actionColor(a)} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StatsLogs() {
  const { t } = useTranslation()
  const [activeReport, setActiveReport] = useState<ReportTab>('activity')
  const [sortOrder, setSortOrder] = useState<SortOrder>('activity')
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const activeTenantId = localStorage.getItem('activeTenantId')

  const loadData = useCallback(async () => {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const params = activeTenantId ? `?tenant_id=${encodeURIComponent(activeTenantId)}` : ''
      const res = await fetch(`${base}/api/activity-stats${params}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`)
      setData(await res.json())
      setLastRefresh(new Date())
      setErr(null)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [activeTenantId])

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 30_000)
    return () => clearInterval(id)
  }, [loadData])

  // ── Derived data ────────────────────────────────────────────────────────────
  const allActions = (() => {
    if (!data) return []
    const set = new Set<string>()
    data.entities.forEach(e => e.rows.forEach(r => set.add(r.action)))
    return Array.from(set)
  })()

  const sortedEntities = data
    ? [...data.entities].sort((a, b) =>
        sortOrder === 'name' ? a.name.localeCompare(b.name) : b.total - a.total,
      )
    : []

  const windowStart = data ? new Date(data.window_start) : new Date()
  const tz          = data?.tz ?? 'America/New_York'

  const CONTROL_H = 44

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1400 }}>
      {/* ── Top card: report buttons ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Stats &amp; Logs</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={activeReport === 'activity' ? 'primary' : undefined}
            onClick={() => setActiveReport('activity')}
            style={{ height: CONTROL_H, minWidth: 120 }}
          >
            Activity
          </button>
          <button
            disabled
            style={{ height: CONTROL_H, minWidth: 120, opacity: 0.35, cursor: 'not-allowed' }}
          >
            —
          </button>
          <button
            disabled
            style={{ height: CONTROL_H, minWidth: 120, opacity: 0.35, cursor: 'not-allowed' }}
          >
            —
          </button>
        </div>
      </div>

      {/* ── Activity report ─────────────────────────────────────────────── */}
      {activeReport === 'activity' && (
        <>
          {/* Controls bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="helper" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                {t('sort')}:
              </span>
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as SortOrder)}
                style={{ height: 36 }}
              >
                <option value="activity">Activity</option>
                <option value="name">Name</option>
              </select>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading && data && (
                <span className="helper" style={{ fontSize: 12 }}>Refreshing…</span>
              )}
              {lastRefresh && (
                <span className="helper" style={{ fontSize: 12 }}>
                  Updated {lastRefresh.toLocaleTimeString()}
                </span>
              )}
              <button onClick={loadData} style={{ height: 32, padding: '0 12px', fontSize: 13 }}>
                ↺
              </button>
            </div>
          </div>

          {/* Error */}
          {err && (
            <div className="card">
              <p style={{ color: 'salmon' }}>{t('error')}: {err}</p>
            </div>
          )}

          {/* Initial loading */}
          {loading && !data && (
            <div className="card"><p>{t('loading')}</p></div>
          )}

          {/* No data */}
          {data && sortedEntities.length === 0 && (
            <div className="card">
              <p className="helper">No activity in the last 24 hours.</p>
            </div>
          )}

          {/* Charts grid: auto-fill → 3 cols on desktop, 1 on mobile */}
          {data && sortedEntities.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: 12,
            }}>
              {sortedEntities.map(entity => (
                <EntityChart
                  key={entity.id}
                  entity={entity}
                  windowStart={windowStart}
                  tz={tz}
                  allActions={allActions}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
