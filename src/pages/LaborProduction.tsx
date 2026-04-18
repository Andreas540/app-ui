// src/pages/LaborProduction.tsx
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, getAuthHeaders } from '../lib/api'
import { todayYMD, formatShortMonthDay, formatShortMonthDayYear, resolveLocale } from '../lib/time'
import i18n from '../i18n/config'
import { DateInput } from '../components/DateInput'

type Product = { id: string; name: string; category?: string }

type ProductEntry = {
  tempId: string // Temporary ID for React keys
  product_id: string
  qty_produced: string
}

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

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [selectedDate, setSelectedDate] = useState(todayYMD())
  const [noOfEmployees, setNoOfEmployees] = useState('')
  const [totalHours, setTotalHours] = useState('')
  const [productEntries, setProductEntries] = useState<ProductEntry[]>([
    { tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }
  ])
  const [notes, setNotes] = useState('')

  // History
  type HistoryRecord = { date: string; product_name: string | null; qty_produced: number | null }
  const [historyFilter, setHistoryFilter] = useState<'day' | 'product'>('day')
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Load products on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { products: bootProducts } = await fetchBootstrap()
        setProducts((bootProducts ?? []).filter(p => p.category !== 'service'))
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      setHistoryLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const to = todayYMD()
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - 90)
      const from = fromDate.toISOString().split('T')[0]
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

      // Load product entries
      const entries: ProductEntry[] = records
        .filter(r => r.product_id != null)
        .map(r => ({
          tempId: crypto.randomUUID(),
          product_id: r.product_id!,
          qty_produced: r.qty_produced != null ? String(r.qty_produced) : ''
        }))

      if (entries.length === 0) {
        // Has employee/hours data but no products
        setProductEntries([{ tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }])
      } else {
        setProductEntries(entries)
      }
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

  function updateProductEntry(tempId: string, field: 'product_id' | 'qty_produced', value: string) {
    setProductEntries(productEntries.map(p => 
      p.tempId === tempId ? { ...p, [field]: value } : p
    ))
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
      avgQtyPerEmployee: avgQtyPerEmployee.toFixed(1),
      avgHoursPerEmployee: avgHoursPerEmployee.toFixed(1)
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
      .map(p => ({
        product_id: p.product_id,
        qty_produced: parseInt(p.qty_produced, 10)
      }))

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
      await loadHistory()
    } catch (e: any) {
      alert(e?.message || t('production.alertSaveFailed'))
    }
  }

  function handleClear() {
    setNoOfEmployees('')
    setTotalHours('')
    setProductEntries([{ tempId: crypto.randomUUID(), product_id: '', qty_produced: '' }])
    setNotes('')
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
    const d = new Date()
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    recentDates.push(`${y}-${m}-${day}`)
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
              {noOfEmployees ? stats.avgQtyPerEmployee : '—'}
            </span>
          </div>
          <div style={{ display: 'none' }}>
            <span className="helper">{t('production.avgHoursPerEmployee')}</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? stats.avgHoursPerEmployee : '—'}
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
        {productEntries.map((entry, index) => (
          <div 
            key={entry.tempId} 
            className="row row-2col-mobile" 
            style={{ marginTop: index > 0 ? 8 : 0, alignItems: 'flex-end' }}
          >
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
        ))}

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

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
          {(['day', 'product'] as const).map(f => (
            <button
              key={f}
              onClick={() => setHistoryFilter(f)}
              style={{
                padding: '6px 18px',
                fontSize: 13,
                background: historyFilter === f ? 'var(--primary)' : 'transparent',
                color: historyFilter === f ? 'white' : 'var(--text, inherit)',
                border: 'none',
                cursor: f === 'product' ? 'default' : 'pointer',
                fontWeight: historyFilter === f ? 600 : 400,
                opacity: f === 'product' ? 0.5 : 1,
              }}
              disabled={f === 'product'}
            >
              {f === 'day' ? t('production.byDay') : t('production.byProduct')}
            </button>
          ))}
        </div>

        {historyLoading ? (
          <p className="helper">{t('loading')}</p>
        ) : history.length === 0 ? (
          <p className="helper">{t('production.noHistory')}</p>
        ) : (() => {
          // Group by date
          const byDate = new Map<string, { product_name: string | null; qty_produced: number | null }[]>()
          for (const r of history) {
            if (!byDate.has(r.date)) byDate.set(r.date, [])
            byDate.get(r.date)!.push({ product_name: r.product_name, qty_produced: r.qty_produced })
          }
          const dates = Array.from(byDate.keys())
          return (
            <div>
              {dates.map((date, di) => {
                const rows = byDate.get(date)!.filter(r => r.product_name && r.qty_produced != null)
                if (rows.length === 0) return null
                const label = new Date(date + 'T12:00:00').toLocaleDateString(resolveLocale(i18n.language || 'en'), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                return (
                  <div key={date} style={{ marginBottom: 0 }}>
                    {di > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
                    {rows.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingBottom: 4 }}>
                        <span>{r.product_name}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                          {r.qty_produced?.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}