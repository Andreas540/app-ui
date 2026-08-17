// src/pages/TimelineOverviewPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useLocale } from '../contexts/LocaleContext'
import { todayYMD } from '../lib/time'
import OrderDetailModal from '../components/OrderDetailModal'
import SupplierOrderDetailModal from '../components/SupplierOrderDetailModal'

// ── Types ──────────────────────────────────────────────────────────────────────

type CustomerOrder = {
  id: string
  order_no: string | number
  customer_id: string
  customer_name: string
  product_names: string
  addon_names: string | null
  order_date: string
  delivered: boolean
  delivered_at: string | null
  amount: number
  cust_status: 'delivered' | 'partial' | 'not_delivered'
}

type SupplierOrder = {
  id: string
  order_no: string | number
  supplier_id: string
  supplier_name: string
  product_names: string
  order_date: string
  est_delivery_date: string | null
  delivered: boolean
  delivery_date: string | null
  received: boolean
  received_date: string | null
  total_cost: number
  derived_status: 'received' | 'partial' | 'mixed' | 'in_customs' | 'shipped' | 'pending'
  stage_events: { stage: string; event_date: string }[]
}

type ShowMode    = 'both' | 'customer' | 'supplier'
type CustGroup   = 'customer' | 'product'
type SuppGroup   = 'supplier' | 'product'

type StageEvent = {
  id: string
  stage: 'shipped' | 'in_customs' | 'received'
  product_name: string
  qty_delta: number
  event_date: string
}

type DeliveryEvent = {
  delivered_quantity: number | string
  total_qty: number | string
  delivery_status: 'delivered' | 'partial' | 'not_delivered'
  event_date: string
  delta?: number
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toDay(s: string): number {
  return Math.floor(new Date(s + 'T00:00:00').getTime() / 86400000)
}
function fromDay(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10)
}
function addDays(s: string, d: number) {
  const dt = new Date(s + 'T00:00:00')
  dt.setDate(dt.getDate() + d)
  return localDateStr(dt)
}
function addMonths(s: string, m: number) {
  const d = new Date(s + 'T00:00:00')
  d.setMonth(d.getMonth() + m)
  return localDateStr(d)
}
function fmtFull(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Gantt geometry helpers ─────────────────────────────────────────────────────

function barGeometry(
  startStr: string,
  endStr: string,
  viewFrom: number,
  viewTo: number
): { left: number; width: number } | null {
  const start = toDay(startStr)
  const end   = toDay(endStr)
  const span  = viewTo - viewFrom
  if (span <= 0 || end < viewFrom || start > viewTo) return null
  const clampedStart = Math.max(start, viewFrom)
  const clampedEnd   = Math.min(end, viewTo)
  return {
    left:  ((clampedStart - viewFrom) / span) * 100,
    width: Math.max(0.4, ((clampedEnd - clampedStart) / span) * 100),
  }
}

function axisMarks(viewFrom: number, viewTo: number): { day: number; label: string }[] {
  const span = viewTo - viewFrom
  let stepDays: number
  let fmt: Intl.DateTimeFormatOptions
  if (span <= 21)       { stepDays = 1;   fmt = { month: 'short', day: 'numeric' } }
  else if (span <= 90)  { stepDays = 7;   fmt = { month: 'short', day: 'numeric' } }
  else if (span <= 365) { stepDays = 30;  fmt = { month: 'short', year: '2-digit' } }
  else                  { stepDays = 91;  fmt = { month: 'short', year: 'numeric' } }

  const marks: { day: number; label: string }[] = []
  // Start at first aligned step after viewFrom
  let d = viewFrom
  if (stepDays >= 7) {
    // align to Monday or 1st of month
    const date = new Date(d * 86400000)
    if (stepDays >= 30) { date.setDate(1) }
    else { const dow = date.getDay(); date.setDate(date.getDate() - dow + 1) }
    d = Math.floor(date.getTime() / 86400000)
    if (d < viewFrom) d += stepDays
  }
  while (d <= viewTo) {
    marks.push({ day: d, label: new Date(d * 86400000).toLocaleDateString(undefined, fmt) })
    d += stepDays
  }
  return marks
}

// ── Dual-thumb date-range slider ───────────────────────────────────────────────

const CTRL_CSS = `
  .gantt-controls-desktop { display: grid; }
  .gantt-controls-mobile   { display: none; }
  .gantt-scroll { overflow-x: hidden; }
  @media (hover: none) and (pointer: coarse) {
    .gantt-controls-desktop { display: none !important; }
    .gantt-controls-mobile  { display: flex !important; flex-direction: column; gap: 10px; margin-bottom: 16px; }
    .gantt-ctrl-row  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .gantt-ctrl-lbl  { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
    .gantt-scroll { overflow-x: auto; }
  }
`

const SLIDER_CSS = `
  .gantt-dual-slider {
    position: relative; height: 28px;
    display: flex; align-items: center;
  }
  .gantt-dual-slider input[type=range] {
    -webkit-appearance: none; appearance: none;
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    background: transparent;
    pointer-events: none;
    margin: 0; padding: 0;
  }
  .gantt-dual-slider input[type=range]::-webkit-slider-runnable-track {
    height: 4px; background: transparent;
  }
  .gantt-dual-slider input[type=range]::-moz-range-track { background: transparent; height: 4px; }
  .gantt-dual-slider input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    pointer-events: all;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--color-primary, #3b82f6);
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    cursor: pointer; margin-top: -6px;
  }
  .gantt-dual-slider input[type=range]::-moz-range-thumb {
    pointer-events: all;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--color-primary, #3b82f6);
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    cursor: pointer;
  }
`

function DateRangeSlider({
  minDay, maxDay, fromDay: fromD, toDay: toD,
  onFromChange, onToChange,
}: {
  minDay: number; maxDay: number
  fromDay: number; toDay: number
  onFromChange: (d: number) => void
  onToChange:   (d: number) => void
}) {
  const [last, setLast] = useState<'from' | 'to'>('to')
  const span     = Math.max(1, maxDay - minDay)
  const leftPct  = ((fromD - minDay) / span) * 100
  const widthPct = Math.max(0, ((toD - fromD) / span) * 100)

  const base: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }

  return (
    <div className="gantt-dual-slider">
      <style dangerouslySetInnerHTML={{ __html: SLIDER_CSS }} />
      <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: 'var(--border-color, #e5e7eb)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', height: 4, background: 'var(--color-primary, #3b82f6)', borderRadius: 2, left: `${leftPct}%`, width: `${widthPct}%` }} />
      <input
        type="range" min={minDay} max={maxDay} value={fromD}
        onMouseDown={() => setLast('from')} onTouchStart={() => setLast('from')}
        onChange={e => onFromChange(Math.min(Number(e.target.value), toD - 1))}
        style={{ ...base, zIndex: last === 'from' ? 5 : 3 }}
      />
      <input
        type="range" min={minDay} max={maxDay} value={toD}
        onMouseDown={() => setLast('to')} onTouchStart={() => setLast('to')}
        onChange={e => onToChange(Math.max(Number(e.target.value), fromD + 1))}
        style={{ ...base, zIndex: last === 'to' ? 5 : 4 }}
      />
    </div>
  )
}

// ── Gantt row ──────────────────────────────────────────────────────────────────

function GanttRow({
  label, sublabel, barStart, barEnd, viewFrom, viewTo,
  color, isDashed, tooltip, onLabelClick, onSublabelClick, isExpanded, eventMarkers,
}: {
  label: string; sublabel?: string
  barStart: string; barEnd: string
  viewFrom: number; viewTo: number
  color: string; isDashed: boolean
  tooltip: string
  onLabelClick?: () => void
  onSublabelClick?: () => void
  isExpanded?: boolean
  eventMarkers?: { date: string; color: string; label: string }[]
}) {
  const geo = barGeometry(barStart, barEnd, viewFrom, viewTo)
  const BAR_H = 9

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 22, gap: 0, paddingRight: 12 }}>
      {/* Label — order # and products on same line */}
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <button
          onClick={onLabelClick}
          style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 500 }}
        >{label}</button>
        {sublabel && (
          onSublabelClick
            ? <button onClick={onSublabelClick} style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 6 }}>
                <span style={{ fontSize: 8, marginRight: 2, display: 'inline-block', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                {sublabel}
              </button>
            : <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>{sublabel}</span>
        )}
      </div>
      {/* Bar area */}
      <div style={{ flex: 1, position: 'relative', height: BAR_H }}>
        {geo && (
          <div
            title={tooltip}
            style={{
              position: 'absolute',
              left:   `${geo.left}%`,
              width:  `${geo.width}%`,
              height: BAR_H,
              background: color,
              opacity: isDashed ? 0.7 : 1,
              borderRadius: 3,
              cursor: 'default',
              boxSizing: 'border-box',
              border: isDashed ? `1.5px dashed ${color}` : 'none',
            }}
          />
        )}
        {eventMarkers?.map((m, i) => {
          const span = viewTo - viewFrom
          const pct  = span > 0 ? ((toDay(m.date) - viewFrom) / span) * 100 : -1
          if (pct < 0 || pct > 100) return null
          return (
            <div
              key={i}
              title={m.label}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 9, height: 9, borderRadius: '50%',
                background: m.color,
                border: '1.5px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                zIndex: 1,
                cursor: 'default',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Stage event dot row ────────────────────────────────────────────────────────

const STAGE_COLORS: Record<StageEvent['stage'], string> = {
  shipped:    '#3b82f6',
  in_customs: '#f97316',
  received:   '#10b981',
}

function EventDotRow({ event, viewFrom, viewTo }: { event: StageEvent; viewFrom: number; viewTo: number }) {
  const { t } = useTranslation()
  const span     = viewTo - viewFrom
  const eventDay = toDay(event.event_date)
  const color    = STAGE_COLORS[event.stage]
  const pct      = span > 0 ? ((eventDay - viewFrom) / span) * 100 : -1
  const inView   = pct >= 0 && pct <= 100

  const stageLabel = event.stage === 'shipped'
    ? t('suppliers.stageShipped')
    : event.stage === 'in_customs'
    ? t('suppliers.stageInCustoms')
    : t('suppliers.stageReceived')

  const qty     = Number(event.qty_delta)
  const absStr  = (() => { const a = Math.abs(qty); return a % 1 === 0 ? String(a) : parseFloat(a.toFixed(4)).toString() })()
  const sign    = qty >= 0 ? '+' : '−'
  const signColor = qty >= 0 ? '#10b981' : '#ef4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 18, paddingRight: 12 }}>
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, paddingLeft: 20, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>{stageLabel}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 5 }}>{event.product_name}</span>
        {qty !== 0 && <span style={{ fontSize: 10, color: signColor, marginLeft: 4, fontWeight: 600 }}>{sign}{absStr}</span>}
      </div>
      <div style={{ flex: 1, position: 'relative', height: 16 }}>
        {inView && (
          <div
            title={`${stageLabel} · ${fmtFull(event.event_date)}`}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 8, height: 8, borderRadius: 4,
              background: color,
              cursor: 'default',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Customer order delivery event row ─────────────────────────────────────────

const DELIVERY_COLORS: Record<string, string> = {
  delivered:     '#10b981',
  partial:       '#f59e0b',
  not_delivered: '#d1d5db',
}

function DeliveryEventRow({ event, viewFrom, viewTo }: { event: DeliveryEvent; viewFrom: number; viewTo: number }) {
  const span     = viewTo - viewFrom
  const eventDay = toDay(event.event_date)
  const pct      = span > 0 ? ((eventDay - viewFrom) / span) * 100 : -1
  const inView   = pct >= 0 && pct <= 100
  const color    = DELIVERY_COLORS[event.delivery_status] ?? '#d1d5db'
  const dQty     = Number(event.delivered_quantity)
  const tQty     = Number(event.total_qty)
  const delta    = Number(event.delta ?? 0)
  const fmt      = (n: number) => n % 1 === 0 ? String(n) : parseFloat(n.toFixed(4)).toString()
  const symbol   = event.delivery_status === 'delivered' ? '✓' : event.delivery_status === 'partial' ? '◐' : '○'
  const deltaStr = delta > 0 ? `+${fmt(delta)}` : delta < 0 ? fmt(delta) : ''
  const deltaColor = delta > 0 ? '#10b981' : '#ef4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 18, paddingRight: 12 }}>
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, paddingLeft: 20, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ color, fontWeight: 600, fontSize: 11, marginRight: 4 }}>{symbol}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmt(dQty)}/{fmt(tQty)}</span>
        {deltaStr && <span style={{ fontSize: 10, color: deltaColor, marginLeft: 4, fontWeight: 600 }}>{deltaStr}</span>}
      </div>
      <div style={{ flex: 1, position: 'relative', height: 16 }}>
        {inView && (
          <div
            title={`${symbol} ${fmt(dQty)}/${fmt(tQty)}${deltaStr ? ' ' + deltaStr : ''} · ${fmtFull(event.event_date)}`}
            style={{
              position: 'absolute', left: `${pct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 8, height: 8, borderRadius: 4,
              background: color, cursor: 'default',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Status colors (matching OrderDetailModal / SupplierOrderDetailModal) ───────

const CUST_COLOR: Record<string, string> = {
  delivered:    '#10b981',
  partial:      '#f59e0b',
  not_delivered: '#d1d5db',
}
const SUPP_COLOR: Record<string, string> = {
  received:   '#10b981',
  partial:    '#f59e0b',
  mixed:      '#8b5cf6',
  in_customs: '#f97316',
  shipped:    '#3b82f6',
  pending:    '#d1d5db',
}

// ── Multi-select dropdown ──────────────────────────────────────────────────────

function MultiSelectDropdown({
  label, options, selected, onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  }
  const count = selected.length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          padding: '5px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          border: count > 0 ? '1.5px solid var(--color-primary)' : '1px solid var(--line)',
          background: count > 0 ? 'var(--color-primary)' : 'var(--panel)',
          color: count > 0 ? '#fff' : 'var(--text-primary)',
          fontWeight: count > 0 ? 600 : 400,
        }}
      >
        {label}{count > 0 ? ` (${count})` : ''} <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
          minWidth: 200, maxWidth: 300, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 4px' }}>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('timeline.filterSearch')} autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12,
                border: '1px solid var(--line)', borderRadius: 5,
                background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </div>
          {count > 0 && (
            <div style={{ padding: '0 8px 4px', textAlign: 'right' }}>
              <button
                onClick={() => { onChange([]); setSearch('') }}
                style={{ fontSize: 11, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
              >{t('timeline.filterClear')}</button>
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{t('timeline.filterNoResults')}</div>
            )}
            {filtered.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} style={{ margin: 0 }} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      paddingTop: 12, paddingBottom: 2,
      display: 'flex', alignItems: 'center', gap: 0, paddingRight: 12,
    }}>
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const PRESETS: [string, number | 'ytd' | 'all'][] = [
  ['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['YTD', 'ytd'], ['All', 'all'],
]

function segBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px 4px 0', fontSize: 12, cursor: 'pointer', borderRadius: 4,
    border: 'none', background: 'transparent',
    color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
    fontWeight: active ? 600 : 400,
  }
}

export default function TimelineOverviewPage() {
  const { t } = useTranslation()
  const { timezone } = useLocale()
  const today       = todayYMD(timezone)
  const defaultFrom = addMonths(today, -1)

  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [custOrders, setCustOrders]     = useState<CustomerOrder[]>([])
  const [suppOrders, setSuppOrders]     = useState<SupplierOrder[]>([])

  // Fetch range (what data we have loaded)
  const [fetchFrom, setFetchFrom] = useState(defaultFrom)
  const [fetchTo,   setFetchTo]   = useState(today)

  // View range (slider position within fetch range)
  const [viewFromDay, setViewFromDay] = useState(toDay(defaultFrom))
  const [viewToDay,   setViewToDay]   = useState(toDay(today))

  // Filters
  const [showMode,    setShowMode]    = useState<ShowMode>('both')
  const [custGroupBy, setCustGroupBy] = useState<CustGroup>('customer')
  const [suppGroupBy, setSuppGroupBy] = useState<SuppGroup>('supplier')
  const [activePreset, setActivePreset] = useState<number | 'ytd' | 'all' | 'custom'>(1)

  // Dropdown filters
  const [selCustomers, setSelCustomers] = useState<string[]>([])
  const [selSuppliers, setSelSuppliers] = useState<string[]>([])
  const [selProducts,  setSelProducts]  = useState<string[]>([])

  // Modal state
  const [custModalOrder, setCustModalOrder] = useState<any>(null)
  const [suppModalOrder, setSuppModalOrder] = useState<any>(null)
  const [suppModalName,  setSuppModalName]  = useState('')

  // Expand state for supplier order stage events
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [orderEvents,    setOrderEvents]    = useState<Map<string, StageEvent[]>>(new Map())
  const [loadingEvents,  setLoadingEvents]  = useState<Set<string>>(new Set())

  // Expand state for customer order delivery events
  const [expandedCustOrders, setExpandedCustOrders] = useState<Set<string>>(new Set())
  const [custOrderEvents,    setCustOrderEvents]    = useState<Map<string, DeliveryEvent[]>>(new Map())
  const [loadingCustEvents,  setLoadingCustEvents]  = useState<Set<string>>(new Set())

  const fetchRef = useRef(0)

  async function fetchData(from: string, to: string): Promise<{ customer_orders: CustomerOrder[]; supplier_orders: SupplierOrder[] } | null> {
    const token = ++fetchRef.current
    setLoading(true); setErr(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/timeline-overview?from=${from}&to=${to}`, {
        cache: 'no-store', headers: getAuthHeaders(),
      })
      if (token !== fetchRef.current) return null
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setCustOrders(data.customer_orders || [])
      setSuppOrders(data.supplier_orders || [])
      return data
    } catch (e: any) {
      if (token === fetchRef.current) setErr(e?.message || String(e))
      return null
    } finally {
      if (token === fetchRef.current) setLoading(false)
    }
  }

  useEffect(() => { fetchData(fetchFrom, fetchTo) }, [])

  async function fetchSupplierOrderData(id: string) {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/order-supplier?id=${id}`, { headers: getAuthHeaders() })
    if (!res.ok) return null
    return res.json()
  }

  async function openSupplierOrder(id: string, supplierName: string) {
    const data = await fetchSupplierOrderData(id)
    if (!data) return
    const items = (data.items ?? []).map((item: any) => ({
      ...item,
      product_total:  Number(item.product_cost)  * Number(item.qty),
      shipping_total: Number(item.shipping_cost) * Number(item.qty),
    }))
    const total    = items.reduce((sum: number, i: any) => sum + i.product_total + i.shipping_total, 0)
    const totalQty = items.reduce((s: number, i: any) => s + Number(i.qty           || 0), 0)
    const recvQty  = items.reduce((s: number, i: any) => s + Number(i.qty_received  || 0), 0)
    const shipQty  = items.reduce((s: number, i: any) => s + Number(i.qty_shipped   || 0), 0)
    const custQty  = items.reduce((s: number, i: any) => s + Number(i.qty_in_customs|| 0), 0)
    const ord = data.order
    let derived_status: string
    if (ord.received || (totalQty > 0 && recvQty >= totalQty)) derived_status = 'received'
    else if (recvQty > 0 && (shipQty > 0 || custQty > 0))      derived_status = 'mixed'
    else if (shipQty > 0 && custQty > 0)                        derived_status = 'mixed'
    else if (recvQty > 0)                                       derived_status = 'partial'
    else if (custQty > 0)                                       derived_status = 'in_customs'
    else if (shipQty > 0 || ord.delivered)                      derived_status = 'shipped'
    else                                                        derived_status = 'pending'
    // Cache events so expand doesn't need a second fetch
    setOrderEvents(prev => new Map(prev).set(id, data.events || []))
    setSuppModalName(supplierName)
    setSuppModalOrder({ ...ord, items, total, derived_status })
  }

  async function toggleExpand(orderId: string) {
    if (expandedOrders.has(orderId)) {
      setExpandedOrders(prev => { const next = new Set(prev); next.delete(orderId); return next })
      return
    }
    setExpandedOrders(prev => new Set([...prev, orderId]))
    if (!orderEvents.has(orderId)) {
      setLoadingEvents(prev => new Set([...prev, orderId]))
      const data = await fetchSupplierOrderData(orderId)
      if (data) setOrderEvents(prev => new Map(prev).set(orderId, data.events || []))
      setLoadingEvents(prev => { const next = new Set(prev); next.delete(orderId); return next })
    }
  }

  async function toggleExpandCust(orderId: string) {
    if (expandedCustOrders.has(orderId)) {
      setExpandedCustOrders(prev => { const next = new Set(prev); next.delete(orderId); return next })
      return
    }
    setExpandedCustOrders(prev => new Set([...prev, orderId]))
    if (!custOrderEvents.has(orderId)) {
      setLoadingCustEvents(prev => new Set([...prev, orderId]))
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res  = await fetch(`${base}/api/order?id=${orderId}`, { headers: getAuthHeaders() })
        const data = await res.json()
        const evts: DeliveryEvent[] = data.delivery_events || []
        const withDelta = evts.map((ev, i) => ({
          ...ev,
          delta: Number(ev.delivered_quantity) - (i > 0 ? Number(evts[i - 1].delivered_quantity) : 0),
        }))
        setCustOrderEvents(prev => new Map(prev).set(orderId, withDelta.reverse()))
      } catch {}
      setLoadingCustEvents(prev => { const next = new Set(prev); next.delete(orderId); return next })
    }
  }

  async function applyPreset(months: number | 'ytd' | 'all') {
    const to = today
    let from: string
    if (months === 'ytd')      from = today.slice(0, 4) + '-01-01'
    else if (months === 'all') from = '2000-01-01'
    else                       from = addMonths(today, -months)
    setFetchFrom(from); setFetchTo(to)
    setViewFromDay(toDay(from)); setViewToDay(toDay(to))
    setActivePreset(months)
    const result = await fetchData(from, to)
    if (months === 'all' && result) {
      const allDates = [
        ...(result.customer_orders || []).map(o => o.order_date),
        ...(result.supplier_orders || []).map(o => o.order_date),
      ]
      if (allDates.length > 0) {
        const minDate = allDates.reduce((a, b) => a < b ? a : b)
        setViewFromDay(toDay(minDate))
        setFetchFrom(minDate)
      }
    }
  }

  // Extend fetch range if slider is pushed outside
  function handleFromChange(d: number) {
    setViewFromDay(d)
    setActivePreset('custom')
    if (fromDay(d) < fetchFrom) {
      const newFrom = addDays(fromDay(d), -14)
      setFetchFrom(newFrom)
      fetchData(newFrom, fetchTo)
    }
  }
  function handleToChange(d: number) {
    setViewToDay(d)
    setActivePreset('custom')
    if (fromDay(d) > fetchTo) {
      const newTo = addDays(fromDay(d), 14)
      setFetchTo(newTo)
      fetchData(fetchFrom, newTo)
    }
  }

  // Slider bounds: min/max of all loaded data (or fetch range)
  const sliderMin = useMemo(() => {
    const dates = [
      ...custOrders.map(o => o.order_date),
      ...suppOrders.map(o => o.order_date),
    ]
    return dates.length ? Math.min(toDay(fetchFrom), ...dates.map(toDay)) : toDay(fetchFrom)
  }, [custOrders, suppOrders, fetchFrom])

  const sliderMax = useMemo(() => {
    const dates = [
      ...custOrders.map(o => o.delivered_at || today),
      ...suppOrders.map(o => o.received_date || today),
    ]
    const computed = dates.length ? Math.max(toDay(fetchTo), ...dates.map(toDay)) : toDay(fetchTo)
    return Math.min(computed, toDay(today))
  }, [custOrders, suppOrders, fetchTo])

  // Axis ticks
  const marks = useMemo(() => axisMarks(viewFromDay, viewToDay), [viewFromDay, viewToDay])

  // Dropdown options (derived from all loaded data, not affected by filters)
  const custOptions = useMemo(() =>
    [...new Map(custOrders.map(o => [o.customer_id, o.customer_name])).entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  , [custOrders])

  const suppOptions = useMemo(() =>
    [...new Map(suppOrders.map(o => [o.supplier_id, o.supplier_name])).entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  , [suppOrders])

  const prodOptions = useMemo(() => {
    const prods = new Set<string>()
    custOrders.forEach(o => o.product_names.split(', ').forEach(p => prods.add(p.trim())))
    suppOrders.forEach(o => o.product_names.split(', ').forEach(p => prods.add(p.trim())))
    return [...prods].sort().map(p => ({ value: p, label: p }))
  }, [custOrders, suppOrders])

  // Customer order rows grouped (with dropdown filters applied)
  const custRows = useMemo(() => {
    const filtered = custOrders.filter(o => {
      if (selCustomers.length > 0 && !selCustomers.includes(o.customer_id)) return false
      if (selProducts.length > 0 && !o.product_names.split(', ').some(p => selProducts.includes(p.trim()))) return false
      return true
    })
    if (custGroupBy === 'customer') {
      const groups = new Map<string, { name: string; orders: CustomerOrder[] }>()
      for (const o of filtered) {
        if (!groups.has(o.customer_id)) groups.set(o.customer_id, { name: o.customer_name, orders: [] })
        groups.get(o.customer_id)!.orders.push(o)
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    } else {
      const groups = new Map<string, { name: string; orders: CustomerOrder[] }>()
      for (const o of filtered) {
        for (const prod of o.product_names.split(', ')) {
          if (!groups.has(prod)) groups.set(prod, { name: prod, orders: [] })
          groups.get(prod)!.orders.push(o)
        }
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [custOrders, custGroupBy, selCustomers, selProducts])

  const suppRows = useMemo(() => {
    const filtered = suppOrders.filter(o => {
      if (selSuppliers.length > 0 && !selSuppliers.includes(o.supplier_id)) return false
      if (selProducts.length > 0 && !o.product_names.split(', ').some(p => selProducts.includes(p.trim()))) return false
      return true
    })
    if (suppGroupBy === 'supplier') {
      const groups = new Map<string, { name: string; orders: SupplierOrder[] }>()
      for (const o of filtered) {
        if (!groups.has(o.supplier_id)) groups.set(o.supplier_id, { name: o.supplier_name, orders: [] })
        groups.get(o.supplier_id)!.orders.push(o)
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    } else {
      const groups = new Map<string, { name: string; orders: SupplierOrder[] }>()
      for (const o of filtered) {
        for (const prod of o.product_names.split(', ')) {
          if (!groups.has(prod)) groups.set(prod, { name: prod, orders: [] })
          groups.get(prod)!.orders.push(o)
        }
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [suppOrders, suppGroupBy, selSuppliers, selProducts])

  const showCust = showMode === 'both' || showMode === 'customer'
  const showSupp = showMode === 'both' || showMode === 'supplier'

  const cols = ['auto', showCust && 'auto', showSupp && 'auto', '1fr'].filter(Boolean).join(' ')
  const hdr: React.CSSProperties  = { fontSize: 11, color: 'var(--text-secondary)', paddingBottom: 5, paddingRight: 16 }
  const lsep: React.CSSProperties = { borderLeft: '1px solid var(--line)', paddingLeft: 16, paddingRight: 16 }
  const btns: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', paddingRight: 16 }
  const lbl11: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }

  const presetBtns = (
    <>
      {PRESETS.map(([label, val]) => (
        <button key={label} style={segBtn(activePreset === val)} onClick={() => applyPreset(val)}>{label}</button>
      ))}
      {activePreset === 'custom' && <button style={segBtn(true)}>{t('timeline.custom')}</button>}
    </>
  )

  return (
    <div className="card page-wide" style={{ paddingBottom: 32 }}>
      <style dangerouslySetInnerHTML={{ __html: CTRL_CSS }} />
      <h3 style={{ marginBottom: 16 }}>{t('timeline.title')}</h3>

      {/* ── Desktop controls: CSS grid so labels (row 1) and buttons (row 2) align across columns ── */}
      <div className="gantt-controls-desktop" style={{ gridTemplateColumns: cols, marginBottom: 16 }}>
        {/* Row 1: labels */}
        <div style={hdr}>{t('timeline.show')}</div>
        {showCust && <div style={{ ...hdr, ...lsep }}>{t('timeline.groupCustomerBy')}</div>}
        {showSupp && <div style={{ ...hdr, ...lsep }}>{t('timeline.groupSupplierBy')}</div>}
        <div style={{ ...hdr, ...lsep, paddingRight: 0 }}>{t('timeline.period')}</div>

        {/* Row 2: buttons */}
        <div style={btns}>
          <button style={segBtn(showMode === 'customer')} onClick={() => setShowMode('customer')}>{t('timeline.showCustomer')}</button>
          <button style={segBtn(showMode === 'supplier')} onClick={() => setShowMode('supplier')}>{t('timeline.showSupplier')}</button>
          <button style={segBtn(showMode === 'both')}     onClick={() => setShowMode('both')}>{t('timeline.showBoth')}</button>
        </div>
        {showCust && (
          <div style={{ ...btns, ...lsep }}>
            <button style={segBtn(custGroupBy === 'customer')} onClick={() => setCustGroupBy('customer')}>{t('timeline.byCustomer')}</button>
            <button style={segBtn(custGroupBy === 'product')}  onClick={() => setCustGroupBy('product')}>{t('timeline.byProduct')}</button>
          </div>
        )}
        {showSupp && (
          <div style={{ ...btns, ...lsep }}>
            <button style={segBtn(suppGroupBy === 'supplier')} onClick={() => setSuppGroupBy('supplier')}>{t('timeline.bySupplier')}</button>
            <button style={segBtn(suppGroupBy === 'product')}  onClick={() => setSuppGroupBy('product')}>{t('timeline.byProduct')}</button>
          </div>
        )}
        <div style={{ ...lsep, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingRight: 0 }}>
          {presetBtns}
        </div>
      </div>

      {/* ── Mobile controls: each section on its own row (label + buttons inline) ── */}
      <div className="gantt-controls-mobile">
        <div className="gantt-ctrl-row">
          <span style={lbl11}>{t('timeline.show')}</span>
          <button style={segBtn(showMode === 'customer')} onClick={() => setShowMode('customer')}>{t('timeline.showCustomer')}</button>
          <button style={segBtn(showMode === 'supplier')} onClick={() => setShowMode('supplier')}>{t('timeline.showSupplier')}</button>
          <button style={segBtn(showMode === 'both')}     onClick={() => setShowMode('both')}>{t('timeline.showBoth')}</button>
        </div>
        {showCust && (
          <div className="gantt-ctrl-row">
            <span style={lbl11}>{t('timeline.groupCustomerBy')}</span>
            <button style={segBtn(custGroupBy === 'customer')} onClick={() => setCustGroupBy('customer')}>{t('timeline.byCustomer')}</button>
            <button style={segBtn(custGroupBy === 'product')}  onClick={() => setCustGroupBy('product')}>{t('timeline.byProduct')}</button>
          </div>
        )}
        {showSupp && (
          <div className="gantt-ctrl-row">
            <span style={lbl11}>{t('timeline.groupSupplierBy')}</span>
            <button style={segBtn(suppGroupBy === 'supplier')} onClick={() => setSuppGroupBy('supplier')}>{t('timeline.bySupplier')}</button>
            <button style={segBtn(suppGroupBy === 'product')}  onClick={() => setSuppGroupBy('product')}>{t('timeline.byProduct')}</button>
          </div>
        )}
        <div className="gantt-ctrl-row">
          <span style={lbl11}>{t('timeline.period')}</span>
          {presetBtns}
        </div>
      </div>

      {/* ── Date slider ── */}
      <div style={{ marginBottom: 16, paddingRight: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
          <span>{fmtFull(fromDay(viewFromDay))}</span>
          <span>{fmtFull(fromDay(viewToDay))}</span>
        </div>
        <DateRangeSlider
          minDay={sliderMin} maxDay={sliderMax}
          fromDay={viewFromDay} toDay={viewToDay}
          onFromChange={handleFromChange}
          onToChange={handleToChange}
        />
      </div>

      {/* ── Dropdown filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {showCust && (
          <MultiSelectDropdown
            label={t('timeline.filterCustomers')}
            options={custOptions}
            selected={selCustomers}
            onChange={setSelCustomers}
          />
        )}
        {showSupp && (
          <MultiSelectDropdown
            label={t('timeline.filterSuppliers')}
            options={suppOptions}
            selected={selSuppliers}
            onChange={setSelSuppliers}
          />
        )}
        <MultiSelectDropdown
          label={t('timeline.filterProducts')}
          options={prodOptions}
          selected={selProducts}
          onChange={setSelProducts}
        />
      </div>

      {/* ── Legend ── */}
      {(() => {
        const dot = (color: string, dashed = false) => (
          <span style={{ width: 20, height: 8, background: color, borderRadius: 2, display: 'inline-block', boxSizing: 'border-box', opacity: dashed ? 0.7 : 1, border: dashed ? `1.5px dashed ${color}` : 'none' }} />
        )
        const item = (color: string, label: string, dashed = false) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{dot(color, dashed)}{label}</span>
        )
        return (
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
            {item('#10b981', t('timeline.legendDone'))}
            {item('#d1d5db', t('timeline.legendPending'), true)}
            {item('#f59e0b', t('timeline.legendPartial'))}
            {item('#3b82f6', t('timeline.legendShipped'))}
            {item('#f97316', t('timeline.legendInCustoms'))}
            {item('#8b5cf6', t('timeline.legendMixed'))}
          </div>
        )
      })()}

      {err && <p style={{ color: 'var(--color-error)' }}>{err}</p>}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>{t('loading')}</p>
      ) : (
        <div className="gantt-scroll">
          <div style={{ minWidth: 600 }}>

            {/* ── Time axis ── */}
            <div style={{ display: 'flex', marginBottom: 4, paddingRight: 12 }}>
              <div style={{ width: 200, flexShrink: 0 }} />
              <div style={{ flex: 1, position: 'relative', height: 20, borderBottom: '1px solid var(--border-color)' }}>
                {marks.map(m => (
                  <div key={m.day} style={{
                    position: 'absolute',
                    left: `${((m.day - viewFromDay) / (viewToDay - viewFromDay)) * 100}%`,
                    fontSize: 10, color: 'var(--text-secondary)',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                  }}>
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Today marker line (overlay concept via row rendering) ── */}

            {/* ── Customer orders ── */}
            {showCust && custRows.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('timeline.sectionCustomerOrders')}</div>
                {custRows.map(group => (
                  <div key={group.name}>
                    <GroupHeader label={group.name} />
                    {group.orders.map(o => {
                      const end            = o.delivered_at || today
                      const fullNames      = o.addon_names ? `${o.product_names} + ${o.addon_names}` : o.product_names
                      const tip            = `#${o.order_no} · ${fullNames}\n${fmtFull(o.order_date)} → ${o.delivered ? fmtFull(end) : t('timeline.ongoing')}`
                      const isExpanded     = expandedCustOrders.has(o.id)
                      const custEvts       = custOrderEvents.get(o.id) ?? []
                      const loadingCustEvt = loadingCustEvents.has(o.id)
                      return (
                        <div key={o.id}>
                          <GanttRow
                            label={`#${o.order_no}`}
                            sublabel={custGroupBy === 'product' ? o.customer_name : fullNames}
                            barStart={o.order_date}
                            barEnd={end}
                            viewFrom={viewFromDay}
                            viewTo={viewToDay}
                            color={CUST_COLOR[o.cust_status] ?? CUST_COLOR.not_delivered}
                            isDashed={o.cust_status === 'not_delivered'}
                            tooltip={tip}
                            onLabelClick={() => setCustModalOrder({ id: o.id, order_no: o.order_no })}
                            onSublabelClick={() => toggleExpandCust(o.id)}
                            isExpanded={isExpanded}
                          />
                          {isExpanded && loadingCustEvt && (
                            <div style={{ paddingLeft: 220, fontSize: 11, color: 'var(--text-secondary)', paddingBottom: 2 }}>…</div>
                          )}
                          {isExpanded && !loadingCustEvt && custEvts.map((ev, idx) => (
                            <DeliveryEventRow key={idx} event={ev} viewFrom={viewFromDay} viewTo={viewToDay} />
                          ))}
                          {isExpanded && !loadingCustEvt && custEvts.length === 0 && (
                            <div style={{ paddingLeft: 220, fontSize: 11, color: 'var(--text-secondary)', paddingBottom: 2 }}>{t('orderModal.deliveryHistory')}: —</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {showCust && custOrders.length === 0 && !loading && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 200 }}>{t('timeline.noCustomerOrders')}</p>
            )}

            {/* ── Supplier orders ── */}
            {showSupp && suppRows.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('timeline.sectionSupplierOrders')}</div>
                {suppRows.map(group => (
                  <div key={group.name}>
                    <GroupHeader label={group.name} />
                    {group.orders.map(o => {
                      const end        = o.received_date || o.delivery_date || today
                      const ds         = o.derived_status
                      const tip        = `#${o.order_no} · ${o.product_names}\n${fmtFull(o.order_date)} → ${ds === 'received' ? fmtFull(end) : (o.est_delivery_date ? t('timeline.est') + ' ' + fmtFull(o.est_delivery_date) : t('timeline.ongoing'))}`
                      const isExpanded = expandedOrders.has(o.id)
                      const evts       = orderEvents.get(o.id) ?? []
                      const loadingEvt = loadingEvents.has(o.id)
                      return (
                        <div key={o.id}>
                          <GanttRow
                            label={`#${o.order_no}`}
                            sublabel={suppGroupBy === 'product' ? o.supplier_name : o.product_names}
                            barStart={o.order_date}
                            barEnd={end}
                            viewFrom={viewFromDay}
                            viewTo={viewToDay}
                            color={SUPP_COLOR[ds] ?? SUPP_COLOR.pending}
                            isDashed={ds === 'pending'}
                            tooltip={tip}
                            onLabelClick={() => openSupplierOrder(o.id, o.supplier_name)}
                            onSublabelClick={() => toggleExpand(o.id)}
                            isExpanded={isExpanded}
                          />
                          {isExpanded && loadingEvt && (
                            <div style={{ paddingLeft: 220, fontSize: 11, color: 'var(--text-secondary)', paddingBottom: 2 }}>…</div>
                          )}
                          {isExpanded && !loadingEvt && evts.filter(ev => Number(ev.qty_delta) > 0).map((ev, idx) => (
                            <EventDotRow key={ev.id ?? idx} event={ev} viewFrom={viewFromDay} viewTo={viewToDay} />
                          ))}
                          {isExpanded && !loadingEvt && evts.length === 0 && (
                            <div style={{ paddingLeft: 220, fontSize: 11, color: 'var(--text-secondary)', paddingBottom: 2 }}>{t('suppliers.stageHistory')}: —</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {showSupp && suppOrders.length === 0 && !loading && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 200 }}>{t('timeline.noSupplierOrders')}</p>
            )}

            {custOrders.length === 0 && suppOrders.length === 0 && !loading && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', paddingTop: 32 }}>{t('timeline.noData')}</p>
            )}

          </div>
        </div>
      )}

      <OrderDetailModal
        isOpen={!!custModalOrder}
        onClose={() => setCustModalOrder(null)}
        order={custModalOrder}
      />
      <SupplierOrderDetailModal
        isOpen={!!suppModalOrder}
        onClose={() => setSuppModalOrder(null)}
        order={suppModalOrder}
        supplierName={suppModalName}
      />
    </div>
  )
}
