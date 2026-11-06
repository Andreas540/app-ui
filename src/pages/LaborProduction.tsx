// src/pages/LaborProduction.tsx
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import {
  todayYMD, formatShortMonthDay, formatShortMonthDayYear, resolveLocale,
  addDaysYMD, addMonthsYMD, weekStartYMD, weekEndYMD, monthStartYMD, monthEndYMD,
} from '../lib/time'
import { useLocale } from '../contexts/LocaleContext'
import i18n from '../i18n/config'
import { DateInput } from '../components/DateInput'

type Granularity = 'day' | 'week' | 'month'

// Default window per granularity, counted in calendar periods ending today.
const DEFAULT_PERIODS: Record<Granularity, number> = { day: 90, week: 13, month: 12 }

const DEFAULT_WINDOW_KEY: Record<Granularity, string> = {
  day: 'production.defaultWindowDay',
  week: 'production.defaultWindowWeek',
  month: 'production.defaultWindowMonth',
}

type Product = { id: string; name: string; category?: string }

type ProductEntry = {
  tempId: string   // React key
  id?: string      // DB row UUID (present for saved rows, undefined for new rows)
  product_id: string
  qty_produced: string
}

type BomItem = { input_product_id: string; input_name: string; qty_per_unit: number }
type BomMap = Record<string, BomItem[]> // product_id → items

type LaborProductionRecord = {
  id: string
  date: string
  no_of_employees: number | null
  total_hours: number | null
  product_id: string | null
  product_name: string | null
  qty_produced: number | null
  notes: string | null
}

export default function LaborProduction() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { fmtNumber } = useCurrency()
  const { timezone } = useLocale()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [selectedDate, setSelectedDate] = useState(todayYMD(timezone))
  const [noOfEmployees, setNoOfEmployees] = useState('')
  const [totalHours, setTotalHours] = useState('')
  const [productEntries, setProductEntries] = useState<ProductEntry[]>([
    { tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }
  ])
  const [notes, setNotes] = useState('')

  // BOM recipes keyed by product_id (fetched lazily on product selection)
  const [bomMap, setBomMap] = useState<BomMap>({})

  // Per-entry consumption overrides: { tempId → { input_product_id → qty string } }
  const [consumptionOverrides, setConsumptionOverrides] = useState<Record<string, Record<string, string>>>({})

  // History
  type HistoryRecord = { date: string; product_name: string | null; qty_produced: number | null }
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [granularity, setGranularity] = useState<Granularity>('day')
  // Empty = use the default window for the current granularity.
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // The window actually queried and bucketed. Custom dates win over the default
  // when set; a half-filled custom range falls back to the default on that side.
  const { rangeFrom, rangeTo } = useMemo(() => {
    const today = todayYMD(timezone)
    let from: string
    if (granularity === 'day')       from = addDaysYMD(today, -(DEFAULT_PERIODS.day - 1))
    else if (granularity === 'week') from = addDaysYMD(weekStartYMD(today), -7 * (DEFAULT_PERIODS.week - 1))
    else                             from = addMonthsYMD(monthStartYMD(today), -(DEFAULT_PERIODS.month - 1))
    return { rangeFrom: customFrom || from, rangeTo: customTo || today }
  }, [granularity, customFrom, customTo, timezone])

  const isCustomRange = Boolean(customFrom || customTo)

  // Bucket history into periods. Week and month rows sum each product across the
  // whole period, otherwise the same product repeats once per day inside a row.
  // A period clipped by either end of the window records what it actually covers.
  const periodGroups = useMemo(() => {
    const startOf = (d: string) =>
      granularity === 'day' ? d : granularity === 'week' ? weekStartYMD(d) : monthStartYMD(d)
    const endOf = (d: string) =>
      granularity === 'day' ? d : granularity === 'week' ? weekEndYMD(d) : monthEndYMD(d)

    const buckets = new Map<string, Map<string, number>>()
    for (const r of history) {
      if (!r.product_name || r.qty_produced == null) continue
      if (r.date < rangeFrom || r.date > rangeTo) continue
      const key = startOf(r.date)
      if (!buckets.has(key)) buckets.set(key, new Map())
      const byProduct = buckets.get(key)!
      byProduct.set(r.product_name, (byProduct.get(r.product_name) ?? 0) + Number(r.qty_produced))
    }

    return Array.from(buckets.keys())
      .sort((a, b) => b.localeCompare(a))   // newest period first
      .map(key => {
        const periodEnd = endOf(key)
        const coveredFrom = key > rangeFrom ? key : rangeFrom
        const coveredTo = periodEnd < rangeTo ? periodEnd : rangeTo
        const clipped = coveredFrom !== key || coveredTo !== periodEnd
        return {
          key,
          periodEnd,
          partial: clipped ? { from: coveredFrom, to: coveredTo } : null,
          rows: Array.from(buckets.get(key)!.entries())
            .map(([product_name, qty]) => ({ product_name, qty }))
            .sort((a, b) => a.product_name.localeCompare(b.product_name)),
        }
      })
  }, [history, granularity, rangeFrom, rangeTo])

  // Load products on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { products: bootProducts } = await fetchBootstrap()
        setProducts((bootProducts ?? []).filter(p => p.category !== 'service' && p.category !== 'material'))
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Refetch whenever the window changes, so switching granularity or picking a
  // custom range pulls the rows that window needs.
  useEffect(() => {
    loadHistory(rangeFrom, rangeTo)
  }, [rangeFrom, rangeTo])

  async function loadHistory(from: string, to: string) {
    try {
      setHistoryLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/labor-production?from=${from}&to=${to}`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setHistory(data.map((r: HistoryRecord) => ({ ...r, date: String(r.date).slice(0, 10) })))
      }
    } catch (e) {
      console.error('Load history error:', e)
    } finally {
      setHistoryLoading(false)
    }
  }

  // Load data when date changes
  useEffect(() => {
    if (!selectedDate) return
    loadDataForDate(selectedDate)
  }, [selectedDate])

  async function loadDataForDate(date: string) {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/labor-production?date=${date}`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load data')
      
      const records: LaborProductionRecord[] = await res.json()

      if (records.length === 0) {
        // No data for this date - clear form
        setNoOfEmployees('')
        setTotalHours('')
        setProductEntries([{ tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }])
        setNotes('')
        return
      }

      // Load data into form
      const firstRecord = records[0]
      setNoOfEmployees(firstRecord.no_of_employees != null ? String(firstRecord.no_of_employees) : '')
      setTotalHours(firstRecord.total_hours != null ? String(firstRecord.total_hours) : '')
      setNotes(firstRecord.notes || '')

      // Load product entries (include DB id for stable update-by-id on re-save)
      const entries: ProductEntry[] = records
        .filter(r => r.product_id != null)
        .map(r => ({
          tempId: crypto.randomUUID(),
          id: r.id,
          product_id: r.product_id!,
          qty_produced: r.qty_produced != null ? String(r.qty_produced) : '',
        }))

      if (entries.length === 0) {
        // Has employee/hours data but no products
        setProductEntries([{ tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }])
      } else {
        setProductEntries(entries)
        // Eagerly fetch BOMs so the consumption panel shows without re-selecting
        entries.forEach(e => { if (e.product_id) fetchBomIfNeeded(e.product_id) })
      }
      setConsumptionOverrides({})
    } catch (e: any) {
      console.error('Load data error:', e)
    }
  }

  function addProductRow() {
    setProductEntries([...productEntries, { 
      tempId: crypto.randomUUID(), 
      product_id: '', 
      qty_produced: '' 
    }])
  }

  function removeProductRow(tempId: string) {
    if (productEntries.length === 1) return // Keep at least one row
    setProductEntries(productEntries.filter(p => p.tempId !== tempId))
  }

  async function fetchBomIfNeeded(productId: string) {
    if (!productId || bomMap[productId] !== undefined) return
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/product-bom?product_id=${productId}`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const items: BomItem[] = data.bom?.items ?? []
      setBomMap(prev => ({ ...prev, [productId]: items }))
    } catch {
      // silently skip — consumption preview is best-effort
    }
  }

  function updateProductEntry(tempId: string, field: 'product_id' | 'qty_produced', value: string) {
    setProductEntries(productEntries.map(p =>
      p.tempId === tempId ? { ...p, [field]: value } : p
    ))
    if (field === 'product_id') {
      // Clear overrides for this row when product changes
      setConsumptionOverrides(prev => { const n = { ...prev }; delete n[tempId]; return n })
      if (value) fetchBomIfNeeded(value)
    }
  }

  function setConsumptionOverride(tempId: string, inputProductId: string, value: string) {
    setConsumptionOverrides(prev => ({
      ...prev,
      [tempId]: { ...prev[tempId], [inputProductId]: value },
    }))
  }

  // Real-time stats calculations
  const stats = useMemo(() => {
    const numEmployees = noOfEmployees ? parseInt(noOfEmployees, 10) : 0
    const numHours = totalHours ? Number(totalHours) : 0

    const totalQty = productEntries.reduce((sum, p) => {
      const qty = p.qty_produced ? parseInt(p.qty_produced, 10) : 0
      return sum + (Number.isInteger(qty) ? qty : 0)
    }, 0)

    const avgQtyPerEmployee = numEmployees > 0 ? (totalQty / numEmployees) : 0
    const avgHoursPerEmployee = numEmployees > 0 ? (numHours / numEmployees) : 0

    return {
      totalQty,
      avgQtyPerEmployee: avgQtyPerEmployee,
      avgHoursPerEmployee: avgHoursPerEmployee
    }
  }, [noOfEmployees, totalHours, productEntries])

  async function handleSave() {
    if (!selectedDate) {
      alert(t('production.alertSelectDate'))
      return
    }

    // Build products array (filter out empty entries)
    const productsToSave = productEntries
      .filter(p => p.product_id && p.qty_produced)
      .map(p => {
        const overrideMap = consumptionOverrides[p.tempId]
        const consumption_overrides = overrideMap
          ? Object.fromEntries(
              Object.entries(overrideMap)
                .filter(([, v]) => Number.isFinite(Number(v)))
                .map(([k, v]) => [k, Number(v)])
            )
          : undefined
        return {
          ...(p.id ? { id: p.id } : {}),
          product_id: p.product_id,
          qty_produced: parseInt(p.qty_produced, 10),
          ...(consumption_overrides && Object.keys(consumption_overrides).length > 0 ? { consumption_overrides } : {}),
        }
      })

    // Validate at least some data is provided
    if (!noOfEmployees && !totalHours && productsToSave.length === 0) {
      alert(t('production.alertEnterValue'))
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/labor-production`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate,
          no_of_employees: noOfEmployees ? parseInt(noOfEmployees, 10) : null,
          total_hours: totalHours ? Number(totalHours) : null,
          products: productsToSave.length > 0 ? productsToSave : null,
          notes: notes.trim() || null
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t('production.alertSaveFailed'))
      }

      alert(t('production.alertSaveSuccess'))
      await loadDataForDate(selectedDate)
      await loadHistory(rangeFrom, rangeTo)
    } catch (e: any) {
      alert(e?.message || t('production.alertSaveFailed'))
    }
  }

  function handleClear() {
    setNoOfEmployees('')
    setTotalHours('')
    setProductEntries([{ tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }])
    setNotes('')
    setConsumptionOverrides({})
  }

  function handleCancel() {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      handleClear()
    }
  }

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{ color: 'var(--color-error)' }}>{t('error')}: {err}</p></div>

  const CONTROL_H = 44

  // Get last 4 days including today for quick access
  const recentDates: string[] = []
  for (let i = 0; i < 4; i++) {
    recentDates.push(addDaysYMD(todayYMD(timezone), -i))
  }

  // Format selected date for display
  const formattedSelectedDate = formatShortMonthDayYear(selectedDate)

  return (
    <div className="card page-normal">
      {/* Statistics at top */}
      <div style={{ 
        padding: 16, 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 8,
        marginBottom: 24
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
          {t('production.statisticsFor')} {formattedSelectedDate}
        </h4>
        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t('production.totalQtyProduced')}</span>
            <span style={{ fontWeight: 600 }}>{stats.totalQty.toLocaleString()}</span>
          </div>
          <div style={{ display: 'none' }}>
            <span className="helper">{t('production.avgQtyPerEmployee')}</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? fmtNumber(stats.avgQtyPerEmployee, 1) : '—'}
            </span>
          </div>
          <div style={{ display: 'none' }}>
            <span className="helper">{t('production.avgHoursPerEmployee')}</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? fmtNumber(stats.avgHoursPerEmployee, 1) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Date selector */}
      <div style={{ marginTop: 16 }}>
        <DateInput
          value={selectedDate}
          onChange={v => setSelectedDate(v)}
          style={{ height: CONTROL_H, width: '100%' }}
        />

        {/* Recent dates - simple buttons without color coding */}
        <div style={{ 
          marginTop: 12, 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: 4 
        }}>
          {recentDates.map(date => {
            const isSelected = date === selectedDate
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--text, inherit)',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 600 : 400
                }}
              >
                {formatShortMonthDay(date)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Labor inputs - HIDDEN */}
      <div className="row row-2col-mobile" style={{ marginTop: 16, display: 'none' }}>
        <div>
          <label>{t('production.noOfEmployees')}</label>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={noOfEmployees}
            onChange={e => setNoOfEmployees(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
        <div>
          <label>{t('production.totalHours')}</label>
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="0.0"
            value={totalHours}
            onChange={e => setTotalHours(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
      </div>

      {/* Product entries */}
      <div style={{ marginTop: 16 }}>
        {productEntries.map((entry, index) => {
          const bomItems = entry.product_id ? (bomMap[entry.product_id] ?? null) : null
          const qty = Number(entry.qty_produced)
          const hasPreview = bomItems && bomItems.length > 0 && Number.isFinite(qty) && qty > 0
          return (
            <div key={entry.tempId} style={{ marginTop: index > 0 ? 12 : 0 }}>
              <div className="row row-2col-mobile" style={{ alignItems: 'flex-end' }}>
                <div>
                  {index === 0 && <label>{t('product')}</label>}
                  <select
                    value={entry.product_id}
                    onChange={e => updateProductEntry(entry.tempId, 'product_id', e.target.value)}
                    style={{ height: CONTROL_H }}
                  >
                    <option value="">{t('production.selectProduct')}</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    {index === 0 && <label>{t('production.quantity')}</label>}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={entry.qty_produced}
                      onChange={e => updateProductEntry(entry.tempId, 'qty_produced', e.target.value)}
                      style={{ height: CONTROL_H }}
                    />
                  </div>
                  {productEntries.length > 1 && (
                    <button
                      onClick={() => removeProductRow(entry.tempId)}
                      style={{
                        padding: '4px 12px',
                        fontSize: 18,
                        height: CONTROL_H,
                        minWidth: CONTROL_H,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--color-error)'
                      }}
                      title={t('remove')}
                    >
                      −
                    </button>
                  )}
                </div>
              </div>

              {/* BOM consumption — editable per-material override */}
              {hasPreview && (
                <div style={{
                  marginTop: 6,
                  marginLeft: 2,
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.04)',
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>
                    {t('production.consumptionPreview')}
                  </div>
                  {bomItems!.map(item => {
                    const formula = qty * item.qty_per_unit
                    const overrideVal = consumptionOverrides[entry.tempId]?.[item.input_product_id]
                    const displayVal = overrideVal ?? String(Math.round(formula * 1000) / 1000)
                    const isOverridden = overrideVal !== undefined && Math.abs(Number(overrideVal) - formula) > 0.0001
                    return (
                      <div key={item.input_product_id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
                        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{item.input_name}</span>
                        {isOverridden && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            req: {fmtNumber(formula)}
                          </span>
                        )}
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={displayVal}
                          onChange={e => setConsumptionOverride(entry.tempId, item.input_product_id, e.target.value)}
                          style={{
                            width: 80, height: 28, fontSize: 12, textAlign: 'right',
                            color: isOverridden ? 'var(--primary)' : 'var(--color-error)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Add product button - below the dropdowns */}
        <div style={{ marginTop: 8 }}>
          <button
            onClick={addProductRow}
            style={{
              padding: '4px 12px',
              fontSize: 20,
              fontWeight: 'bold',
              height: 32,
              minWidth: 32
            }}
            title={t('production.addProduct')}
          >
            +
          </button>
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginTop: 16 }}>
        <label>{t('notes')}</label>
        <input
          type="text"
          placeholder={t('production.notesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ height: CONTROL_H }}
        />
      </div>

      {/* Buttons */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          className="primary"
          onClick={handleSave}
          style={{ height: CONTROL_H }}
        >
          {t('save')}
        </button>
        <button
          onClick={handleClear}
          style={{ height: CONTROL_H }}
        >
          {t('clear')}
        </button>
        <button
          onClick={handleCancel}
          style={{ height: CONTROL_H }}
        >
          {t('cancel')}
        </button>
      </div>

      {/* Production History */}
      <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>{t('production.history')}</h4>

        {/* Granularity */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
          {(['day', 'week', 'month'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              style={{
                padding: '6px 18px',
                fontSize: 13,
                background: granularity === g ? 'var(--primary)' : 'transparent',
                color: granularity === g ? 'white' : 'var(--text, inherit)',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
                fontWeight: granularity === g ? 600 : 400,
              }}
            >
              {g === 'day' ? t('production.byDay') : g === 'week' ? t('production.byWeek') : t('production.byMonth')}
            </button>
          ))}
        </div>

        {/* Custom period */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6, minWidth: 0 }}>
          <DateInput
            value={customFrom}
            onChange={v => setCustomFrom(v)}
            placeholder={t('production.customFrom')}
            style={{ height: 36, flex: '1 1 150px', minWidth: 0 }}
          />
          <span className="helper">–</span>
          <DateInput
            value={customTo}
            onChange={v => setCustomTo(v)}
            placeholder={t('production.customTo')}
            style={{ height: 36, flex: '1 1 150px', minWidth: 0 }}
          />
          {isCustomRange && (
            <button
              onClick={() => { setCustomFrom(''); setCustomTo('') }}
              style={{ height: 36, padding: '0 14px', fontSize: 13 }}
            >
              {t('production.resetPeriod')}
            </button>
          )}
        </div>
        <p className="helper" style={{ marginTop: 0, marginBottom: 16, fontSize: 12 }}>
          {isCustomRange
            ? `${formatShortMonthDayYear(rangeFrom)} – ${formatShortMonthDayYear(rangeTo)}`
            : t(DEFAULT_WINDOW_KEY[granularity], { n: DEFAULT_PERIODS[granularity] })}
        </p>

        {historyLoading ? (
          <p className="helper">{t('loading')}</p>
        ) : periodGroups.length === 0 ? (
          <p className="helper">{t('production.noHistory')}</p>
        ) : (() => {
          const locale = resolveLocale(i18n.language || 'en')
          const labelFor = (key: string, periodEnd: string) => {
            if (granularity === 'day') {
              return new Date(key + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
            }
            if (granularity === 'month') {
              return new Date(key + 'T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' })
            }
            return `${formatShortMonthDay(key)} – ${formatShortMonthDayYear(periodEnd)}`
          }
          return (
            <div>
              {periodGroups.map((g, gi) => (
                <div key={g.key} style={{ marginBottom: 0 }}>
                  {gi > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />}
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {labelFor(g.key, g.periodEnd)}
                    {g.partial && (
                      <span style={{ fontWeight: 400, fontStyle: 'italic' }}>
                        {' · '}{t('production.partialPeriod')} ({formatShortMonthDay(g.partial.from)} – {formatShortMonthDay(g.partial.to)})
                      </span>
                    )}
                  </div>
                  {g.rows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingBottom: 4 }}>
                      <span>{r.product_name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                        {r.qty.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}