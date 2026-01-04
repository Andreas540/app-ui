// src/pages/LaborProduction.tsx
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBootstrap, getAuthHeaders } from '../lib/api'
import { todayYMD } from '../lib/time'

type Product = { id: string; name: string }

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

const translations = {
  en: {
    statisticsFor: 'Statistics for',
    totalQtyProduced: 'Total qty produced:',
    avgQtyPerEmployee: 'Avg. qty per employee:',
    avgHoursPerEmployee: 'Avg. hours per employee:',
    noOfEmployees: 'No. of Employees',
    totalHours: 'Total Hours',
    product: 'Product',
    quantity: 'Quantity',
    selectProduct: 'Select product...',
    notes: 'Notes (optional)',
    notesPlaceholder: 'Optional notes...',
    save: 'Save',
    clear: 'Clear',
    cancel: 'Cancel',
    loading: 'Loading…',
    error: 'Error:',
    remove: 'Remove',
    addProduct: 'Add product',
    alertSelectDate: 'Please select a date',
    alertEnterValue: 'Please enter at least one value',
    alertSaveSuccess: 'Data saved successfully!',
    alertSaveFailed: 'Save failed'
  },
  es: {
    statisticsFor: 'Estadísticas para',
    totalQtyProduced: 'Cantidad total producida:',
    avgQtyPerEmployee: 'Cantidad promedio por empleado:',
    avgHoursPerEmployee: 'Horas promedio por empleado:',
    noOfEmployees: 'Número de Empleados',
    totalHours: 'Horas Totales',
    product: 'Producto',
    quantity: 'Cantidad',
    selectProduct: 'Seleccionar producto...',
    notes: 'Notas (opcional)',
    notesPlaceholder: 'Notas opcionales...',
    save: 'Guardar',
    clear: 'Limpiar',
    cancel: 'Cancelar',
    loading: 'Cargando…',
    error: 'Error:',
    remove: 'Eliminar',
    addProduct: 'Agregar producto',
    alertSelectDate: 'Por favor seleccione una fecha',
    alertEnterValue: 'Por favor ingrese al menos un valor',
    alertSaveSuccess: '¡Datos guardados exitosamente!',
    alertSaveFailed: 'Error al guardar'
  }
}

export default function LaborProduction() {
  const navigate = useNavigate()

  const [language, setLanguage] = useState<'en' | 'es'>('es') // Spanish is default
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

  const t = translations[language]

  // Load products on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { products: bootProducts } = await fetchBootstrap()
        setProducts(bootProducts ?? [])
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
      alert(t.alertSelectDate)
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
      alert(t.alertEnterValue)
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
        throw new Error(errData.error || t.alertSaveFailed)
      }

      alert(t.alertSaveSuccess)
      await loadDataForDate(selectedDate) // Reload to show saved data
    } catch (e: any) {
      alert(e?.message || t.alertSaveFailed)
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

  if (loading) return <div className="card"><p>{t.loading}</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>{t.error} {err}</p></div>

  const CONTROL_H = 44

  // Get last 4 days including today for quick access
  const recentDates: string[] = []
  for (let i = 0; i < 4; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    recentDates.push(d.toISOString().split('T')[0])
  }

  // Format selected date for display
  const formattedSelectedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      {/* Language toggle flags - top right */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        gap: 8,
        marginBottom: 16
      }}>
        <button
          onClick={() => setLanguage('en')}
          style={{
            fontSize: 24,
            padding: '4px 8px',
            border: language === 'en' ? '2px solid var(--primary)' : '1px solid var(--border)',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            lineHeight: 1
          }}
          title="English"
        >
          🇺🇸
        </button>
        <button
          onClick={() => setLanguage('es')}
          style={{
            fontSize: 24,
            padding: '4px 8px',
            border: language === 'es' ? '2px solid var(--primary)' : '1px solid var(--border)',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            lineHeight: 1
          }}
          title="Español"
        >
          🇪🇸
        </button>
      </div>

      {/* Statistics at top */}
      <div style={{ 
        padding: 16, 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 8,
        marginBottom: 24
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
          {t.statisticsFor} {formattedSelectedDate}
        </h4>
        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t.totalQtyProduced}</span>
            <span style={{ fontWeight: 600 }}>{stats.totalQty.toLocaleString()}</span>
          </div>
          <div style={{ display: 'none' }}>
            <span className="helper">{t.avgQtyPerEmployee}</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? stats.avgQtyPerEmployee : '—'}
            </span>
          </div>
          <div style={{ display: 'none' }}>
            <span className="helper">{t.avgHoursPerEmployee}</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? stats.avgHoursPerEmployee : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Date selector */}
      <div style={{ marginTop: 16 }}>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
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
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 600 : 400
                }}
              >
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </button>
            )
          })}
        </div>
      </div>

      {/* Labor inputs - HIDDEN */}
      <div className="row row-2col-mobile" style={{ marginTop: 16, display: 'none' }}>
        <div>
          <label>{t.noOfEmployees}</label>
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
          <label>{t.totalHours}</label>
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
              {index === 0 && <label>{t.product}</label>}
              <select
                value={entry.product_id}
                onChange={e => updateProductEntry(entry.tempId, 'product_id', e.target.value)}
                style={{ height: CONTROL_H }}
              >
                <option value="">{t.selectProduct}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                {index === 0 && <label>{t.quantity}</label>}
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
                    color: 'salmon'
                  }}
                  title={t.remove}
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
            title={t.addProduct}
          >
            +
          </button>
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginTop: 16 }}>
        <label>{t.notes}</label>
        <input
          type="text"
          placeholder={t.notesPlaceholder}
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
          {t.save}
        </button>
        <button 
          onClick={handleClear}
          style={{ height: CONTROL_H }}
        >
          {t.clear}
        </button>
        <button 
          onClick={handleCancel}
          style={{ height: CONTROL_H }}
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )
}