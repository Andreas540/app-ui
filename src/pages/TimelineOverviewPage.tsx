// src/pages/TimelineOverviewPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

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
  color, isDelivered, tooltip,
}: {
  label: string; sublabel?: string
  barStart: string; barEnd: string
  viewFrom: number; viewTo: number
  color: string; isDelivered: boolean
  tooltip: string
}) {
  const geo = barGeometry(barStart, barEnd, viewFrom, viewTo)
  const BAR_H = 18

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 28, gap: 0 }}>
      {/* Label */}
      <div style={{ width: 200, flexShrink: 0, paddingRight: 8, overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sublabel}</div>}
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
              opacity: isDelivered ? 1 : 0.65,
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
const DEFAULT_FROM = addMonths(TODAY, -6)

function segBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
    border: active ? '1.5px solid var(--color-primary)' : '1.5px solid var(--border-color)',
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)',
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

  const fetchRef = useRef(0)

  async function fetchData(from: string, to: string) {
    const token = ++fetchRef.current
    setLoading(true); setErr(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/timeline-overview?from=${from}&to=${to}`, {
        cache: 'no-store', headers: getAuthHeaders(),
      })
      if (token !== fetchRef.current) return
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setCustOrders(data.customer_orders || [])
      setSuppOrders(data.supplier_orders || [])
    } catch (e: any) {
      if (token === fetchRef.current) setErr(e?.message || String(e))
    } finally {
      if (token === fetchRef.current) setLoading(false)
    }
  }

  useEffect(() => { fetchData(fetchFrom, fetchTo) }, [])

  function applyPreset(months: number | 'ytd' | 'all') {
    let from: string
    const to = TODAY
    if (months === 'ytd')  from = TODAY.slice(0, 4) + '-01-01'
    else if (months === 'all') from = '2000-01-01'
    else from = addMonths(TODAY, -months)
    setFetchFrom(from); setFetchTo(to)
    setViewFromDay(toDay(from)); setViewToDay(toDay(to))
    fetchData(from, to)
  }

  // Extend fetch range if slider is pushed outside
  function handleFromChange(d: number) {
    setViewFromDay(d)
    if (fromDay(d) < fetchFrom) {
      const newFrom = addDays(fromDay(d), -14)
      setFetchFrom(newFrom)
      fetchData(newFrom, fetchTo)
    }
  }
  function handleToChange(d: number) {
    setViewToDay(d)
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

  // Customer order rows grouped
  const custRows = useMemo(() => {
    if (custGroupBy === 'customer') {
      const groups = new Map<string, { name: string; orders: CustomerOrder[] }>()
      for (const o of custOrders) {
        if (!groups.has(o.customer_id)) groups.set(o.customer_id, { name: o.customer_name, orders: [] })
        groups.get(o.customer_id)!.orders.push(o)
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    } else {
      // Group by product
      const groups = new Map<string, { name: string; orders: CustomerOrder[] }>()
      for (const o of custOrders) {
        for (const prod of o.product_names.split(', ')) {
          if (!groups.has(prod)) groups.set(prod, { name: prod, orders: [] })
          groups.get(prod)!.orders.push(o)
        }
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [custOrders, custGroupBy])

  const suppRows = useMemo(() => {
    if (suppGroupBy === 'supplier') {
      const groups = new Map<string, { name: string; orders: SupplierOrder[] }>()
      for (const o of suppOrders) {
        if (!groups.has(o.supplier_id)) groups.set(o.supplier_id, { name: o.supplier_name, orders: [] })
        groups.get(o.supplier_id)!.orders.push(o)
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    } else {
      const groups = new Map<string, { name: string; orders: SupplierOrder[] }>()
      for (const o of suppOrders) {
        for (const prod of o.product_names.split(', ')) {
          if (!groups.has(prod)) groups.set(prod, { name: prod, orders: [] })
          groups.get(prod)!.orders.push(o)
        }
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [suppOrders, suppGroupBy])

  const showCust = showMode === 'both' || showMode === 'customer'
  const showSupp = showMode === 'both' || showMode === 'supplier'

  return (
    <div className="card page-wide" style={{ paddingBottom: 32 }}>
      <h3 style={{ marginBottom: 16 }}>{t('timeline.title')}</h3>

      {/* ── Controls ── */}
      {(() => {
        const hdr: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', marginBottom: 5 }
        const sep: React.CSSProperties = { paddingRight: 16, marginRight: 16, borderRight: '1px solid var(--line)' }
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px 0', marginBottom: 16 }}>
            <div style={sep}>
              <div style={hdr}>{t('timeline.show')}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={segBtn(showMode === 'customer')} onClick={() => setShowMode('customer')}>{t('timeline.showCustomer')}</button>
                <button style={segBtn(showMode === 'supplier')} onClick={() => setShowMode('supplier')}>{t('timeline.showSupplier')}</button>
                <button style={segBtn(showMode === 'both')}     onClick={() => setShowMode('both')}>{t('timeline.showBoth')}</button>
              </div>
            </div>
            {showCust && (
              <div style={sep}>
                <div style={hdr}>{t('timeline.groupCustomerBy')}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={segBtn(custGroupBy === 'customer')} onClick={() => setCustGroupBy('customer')}>{t('timeline.byCustomer')}</button>
                  <button style={segBtn(custGroupBy === 'product')}  onClick={() => setCustGroupBy('product')}>{t('timeline.byProduct')}</button>
                </div>
              </div>
            )}
            {showSupp && (
              <div style={sep}>
                <div style={hdr}>{t('timeline.groupSupplierBy')}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={segBtn(suppGroupBy === 'supplier')} onClick={() => setSuppGroupBy('supplier')}>{t('timeline.bySupplier')}</button>
                  <button style={segBtn(suppGroupBy === 'product')}  onClick={() => setSuppGroupBy('product')}>{t('timeline.byProduct')}</button>
                </div>
              </div>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <div style={hdr}>{t('timeline.period')}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {([['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['YTD', 'ytd'], ['All', 'all']] as [string, number | 'ytd' | 'all'][]).map(([label, val]) => (
                  <button key={label} style={segBtn(false)} onClick={() => applyPreset(val)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
        {showCust && <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 20, height: 10, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} />
            {t('timeline.legendDelivered')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 20, height: 10, background: '#3b82f6', opacity: 0.55, border: '1.5px dashed #3b82f6', borderRadius: 2, display: 'inline-block', boxSizing: 'border-box' }} />
            {t('timeline.legendPending')}
          </span>
        </>}
        {showSupp && <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 20, height: 10, background: '#f59e0b', borderRadius: 2, display: 'inline-block' }} />
            {t('timeline.legendReceived')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 20, height: 10, background: '#f59e0b', opacity: 0.55, border: '1.5px dashed #f59e0b', borderRadius: 2, display: 'inline-block', boxSizing: 'border-box' }} />
            {t('timeline.legendOrdered')}
          </span>
        </>}
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>{t('timeline.sectionCustomerOrders')}</div>
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
                          color="#3b82f6"
                          isDelivered={o.delivered}
                          tooltip={tip}
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>{t('timeline.sectionSupplierOrders')}</div>
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
                          color="#f59e0b"
                          isDelivered={done}
                          tooltip={tip}
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
    </div>
  )
}
