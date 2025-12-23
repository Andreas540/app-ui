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

type CalendarSummary = {
  date: string
  has_employees: number | null
  has_hours: number | null
  product_count: number
}

export default function LaborProduction() {
  const navigate = useNavigate()

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

  // Calendar color coding data
  const [calendarSummary, setCalendarSummary] = useState<CalendarSummary[]>([])

  // Load products and calendar summary on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setErr(null)
        const { products: bootProducts } = await fetchBootstrap()
        setProducts(bootProducts ?? [])
        
        // Load calendar summary
        await loadCalendarSummary()
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

  async function loadCalendarSummary() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/labor-production`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load calendar summary')
      const data = await res.json()
      setCalendarSummary(data)
    } catch (e: any) {
      console.error('Calendar summary load error:', e)
    }
  }

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
      alert('Please select a date')
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
      alert('Please enter at least one value')
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
        throw new Error(errData.error || 'Save failed')
      }

      alert('Data saved successfully!')
      await loadCalendarSummary() // Refresh calendar colors
      await loadDataForDate(selectedDate) // Reload to show saved data
    } catch (e: any) {
      alert(e?.message || 'Save failed')
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

  // Get calendar color for a date
  function getDateColor(date: string): string {
    const summary = calendarSummary.find(s => s.date === date)
    if (!summary) return 'white'
    
    const hasEmployees = summary.has_employees != null
    const hasHours = summary.has_hours != null
    const hasProducts = summary.product_count > 0

    // Green if all three
    if (hasEmployees && hasHours && hasProducts) return '#22c55e'
    // Yellow if at least one
    if (hasEmployees || hasHours || hasProducts) return '#fbbf24'
    // White otherwise
    return 'white'
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>

  const CONTROL_H = 44

  // Get available dates for color coding (last 30 days)
  const dates: string[] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }

  return (
    <div className="card" style={{ maxWidth: 800 }}>
      <h3>Labor & Production</h3>

      {/* Date selector with color coding hints */}
      <div style={{ marginTop: 16 }}>
        <label>Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ height: CONTROL_H, width: '100%' }}
        />
        
        {/* Color coding legend */}
        <div style={{ 
          marginTop: 8, 
          display: 'flex', 
          gap: 16, 
          fontSize: 12,
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ 
              width: 12, 
              height: 12, 
              background: '#22c55e', 
              borderRadius: 2 
            }} />
            <span>Complete data</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ 
              width: 12, 
              height: 12, 
              background: '#fbbf24', 
              borderRadius: 2 
            }} />
            <span>Partial data</span>
          </div>
        </div>

        {/* Recent dates with color coding */}
        <div style={{ 
          marginTop: 12, 
          display: 'flex', 
          flexWrap: 'wrap',
          gap: 4 
        }}>
          {dates.slice(0, 10).map(date => {
            const color = getDateColor(date)
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
                  background: color === 'white' ? 'transparent' : color,
                  color: color === 'white' ? 'white' : '#000',
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

      {/* Labor inputs */}
      <div className="row row-2col-mobile" style={{ marginTop: 16 }}>
        <div>
          <label>No. of Employees</label>
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
          <label>Total Hours</label>
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
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 8
        }}>
          <label style={{ margin: 0 }}>Products Produced</label>
          <button
            onClick={addProductRow}
            style={{
              padding: '4px 12px',
              fontSize: 20,
              fontWeight: 'bold',
              height: 32,
              minWidth: 32
            }}
            title="Add product"
          >
            +
          </button>
        </div>

        {productEntries.map((entry, index) => (
          <div 
            key={entry.tempId} 
            className="row row-2col-mobile" 
            style={{ marginTop: index > 0 ? 8 : 0, alignItems: 'flex-end' }}
          >
            <div>
              {index === 0 && <label>Product</label>}
              <select
                value={entry.product_id}
                onChange={e => updateProductEntry(entry.tempId, 'product_id', e.target.value)}
                style={{ height: CONTROL_H }}
              >
                <option value="">Select product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                {index === 0 && <label>Quantity</label>}
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
                  title="Remove"
                >
                  −
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div style={{ marginTop: 16 }}>
        <label>Notes (optional)</label>
        <input
          type="text"
          placeholder="Optional notes..."
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
          Save
        </button>
        <button 
          onClick={handleClear}
          style={{ height: CONTROL_H }}
        >
          Clear
        </button>
        <button 
          onClick={handleCancel}
          style={{ height: CONTROL_H }}
        >
          Cancel
        </button>
      </div>

      {/* Real-time stats */}
      <div style={{ 
        marginTop: 24, 
        padding: 16, 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 8 
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>
          Statistics
        </h4>
        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">Total qty produced:</span>
            <span style={{ fontWeight: 600 }}>{stats.totalQty.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">Avg. qty per employee:</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? stats.avgQtyPerEmployee : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">Avg. hours per employee:</span>
            <span style={{ fontWeight: 600 }}>
              {noOfEmployees ? stats.avgHoursPerEmployee : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}