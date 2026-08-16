// src/pages/TimelineOverviewPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import OrderDetailModal from '../components/OrderDetailModal'
import SupplierOrderDetailModal from '../components/SupplierOrderDetailModal'

// ── Types ──────────────────────────────────────────────────────────────────────

type CustomerOrder = {
  id: string
  order_no: string | number
  customer_id: string
  customer_name: string
  product_names: string
  order_date: string
  delivered: boolean
  delivered_at: string | null
  amount: number
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
}

type ShowMode    = 'both' | 'customer' | 'supplier'
type CustGroup   = 'customer' | 'product'
type SuppGroup   = 'supplier' | 'product'

// ── Date helpers ───────────────────────────────────────────────────────────────

function toDay(s: string): number {
  return Math.floor(new Date(s + 'T00:00:00').getTime() / 86400000)
}
function fromDay(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10)
}
function todayStr() { return new Date().toISOString().slice(0, 10) }
function addDays(s: string, d: number) { return fromDay(toDay(s) + d) }
function addMonths(s: string, m: number) {
  const d = new Date(s + 'T00:00:00')
  d.setMonth(d.getMonth() + m)
  return d.toISOString().slice(0, 10)
}
function fmtShort(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
  @media (hover: none) and (pointer: coarse) {
    .gantt-controls-desktop { display: none !important; }
    .gantt-controls-mobile  { display: flex !important; flex-direction: column; gap: 10px; margin-bottom: 16px; }
    .gantt-ctrl-row  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .gantt-ctrl-lbl  { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
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
  color, isDelivered, tooltip, onLabelClick,
}: {
  label: string; sublabel?: string
  barStart: string; barEnd: string
  viewFrom: number; viewTo: number
  color: string; isDelivered: boolean
  tooltip: string
  onLabelClick?: () => void
}) {
  const geo = barGeometry(barStart, barEnd, viewFrom, viewTo)
  const BAR_H = 9

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 22, gap: 0 }}>
      {/* Label — order # and products on same line */}
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <button
          onClick={onLabelClick}
          style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 500 }}
        >{label}</button>
        {sublabel && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>{sublabel}</span>}
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
              opacity: isDelivered ? 1 : 0.75,
              borderRadius: 3,
              cursor: 'default',
              boxSizing: 'border-box',
              border: isDelivered ? 'none' : `1.5px dashed ${color}`,
            }}
          />
        )}
      </div>
    </div>
  )
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
      display: 'flex', alignItems: 'center', gap: 0,
    }}>
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const TODAY = todayStr()
const DEFAULT_FROM = addMonths(TODAY, -1)
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

  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [custOrders, setCustOrders]     = useState<CustomerOrder[]>([])
  const [suppOrders, setSuppOrders]     = useState<SupplierOrder[]>([])

  // Fetch range (what data we have loaded)
  const [fetchFrom, setFetchFrom] = useState(DEFAULT_FROM)
  const [fetchTo,   setFetchTo]   = useState(TODAY)

  // View range (slider position within fetch range)
  const [viewFromDay, setViewFromDay] = useState(toDay(DEFAULT_FROM))
  const [viewToDay,   setViewToDay]   = useState(toDay(TODAY))

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

  async function openSupplierOrder(id: string, supplierName: string) {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/order-supplier?id=${id}`, { headers: getAuthHeaders() })
    if (!res.ok) return
    const data = await res.json()
    const items = (data.items ?? []).map((item: any) => ({
      ...item,
      product_total:  Number(item.product_cost)  * Number(item.qty),
      shipping_total: Number(item.shipping_cost) * Number(item.qty),
    }))
    const total = items.reduce((sum: number, item: any) => sum + item.product_total + item.shipping_total, 0)
    setSuppModalName(supplierName)
    setSuppModalOrder({ ...data.order, items, total })
  }

  async function applyPreset(months: number | 'ytd' | 'all') {
    const to = TODAY
    let from: string
    if (months === 'ytd')      from = TODAY.slice(0, 4) + '-01-01'
    else if (months === 'all') from = '2000-01-01'
    else                       from = addMonths(TODAY, -months)
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
      ...custOrders.map(o => o.delivered_at || TODAY),
      ...suppOrders.map(o => o.received_date || o.est_delivery_date || TODAY),
    ]
    return dates.length ? Math.max(toDay(fetchTo), ...dates.map(toDay)) : toDay(fetchTo)
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
      <div style={{ marginBottom: 16 }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
          <span>{fmtShort(fromDay(sliderMin))}</span>
          <span>{fmtShort(fromDay(sliderMax))}</span>
        </div>
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
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 20, height: 8, background: '#22c55e', borderRadius: 2, display: 'inline-block' }} />
          {t('timeline.legendDone')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 20, height: 8, background: '#f97316', opacity: 0.75, border: '1.5px dashed #f97316', borderRadius: 2, display: 'inline-block', boxSizing: 'border-box' }} />
          {t('timeline.legendPending')}
        </span>
      </div>

      {err && <p style={{ color: 'var(--color-error)' }}>{err}</p>}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>{t('loading')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 600 }}>

            {/* ── Time axis ── */}
            <div style={{ display: 'flex', marginBottom: 4 }}>
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
                      const end = o.delivered_at || TODAY
                      const tip = `#${o.order_no} · ${o.product_names}\n${fmtFull(o.order_date)} → ${o.delivered ? fmtFull(end) : t('timeline.ongoing')}`
                      return (
                        <GanttRow
                          key={o.id}
                          label={`#${o.order_no}`}
                          sublabel={custGroupBy === 'product' ? o.customer_name : o.product_names}
                          barStart={o.order_date}
                          barEnd={end}
                          viewFrom={viewFromDay}
                          viewTo={viewToDay}
                          color={o.delivered ? '#22c55e' : '#f97316'}
                          isDelivered={o.delivered}
                          tooltip={tip}
                          onLabelClick={() => setCustModalOrder({ id: o.id, order_no: o.order_no })}
                        />
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
                      const end = o.received_date || o.delivery_date || o.est_delivery_date || addDays(o.order_date, 14)
                      const done = o.received
                      const tip = `#${o.order_no} · ${o.product_names}\n${fmtFull(o.order_date)} → ${done ? fmtFull(end) : (o.est_delivery_date ? t('timeline.est') + ' ' + fmtFull(o.est_delivery_date) : t('timeline.ongoing'))}`
                      return (
                        <GanttRow
                          key={o.id}
                          label={`#${o.order_no}`}
                          sublabel={suppGroupBy === 'product' ? o.supplier_name : o.product_names}
                          barStart={o.order_date}
                          barEnd={end}
                          viewFrom={viewFromDay}
                          viewTo={viewToDay}
                          color={done ? '#22c55e' : '#f97316'}
                          isDelivered={done}
                          tooltip={tip}
                          onLabelClick={() => openSupplierOrder(o.id, o.supplier_name)}
                        />
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
