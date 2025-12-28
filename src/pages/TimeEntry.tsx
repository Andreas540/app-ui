// src/pages/TimeEntry.tsx
import { useEffect, useState, useMemo } from 'react'
import { getAuthHeaders } from '../lib/api'
import { todayYMD } from '../lib/time'

type Employee = {
  id: string
  name: string
  employee_code: string | null
  active: boolean
}

type TimeEntry = {
  id: string
  employee_id: string
  employee_name: string
  work_date: string
  start_time: string
  end_time: string
  total_hours: number | null
  approved: boolean
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export default function TimeEntry() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(todayYMD())
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [notes, setNotes] = useState('')

  // Time entries list
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [viewPeriod, setViewPeriod] = useState<'week' | 'month'>('week')

  // Load employees on mount
  useEffect(() => {
    loadEmployees()
  }, [])

  // Load time entries when employee or period changes
  useEffect(() => {
    if (selectedEmployeeId) {
      loadTimeEntries()
    }
  }, [selectedEmployeeId, viewPeriod])

  async function loadEmployees() {
    try {
      setLoading(true)
      setErr(null)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees?active=true`, {
        headers: getAuthHeaders(),
      })
      
      if (!res.ok) throw new Error('Failed to load employees')
      
      const data = await res.json()
      setEmployees(data)
      
      // Pre-select first employee
      if (data.length > 0) {
        setSelectedEmployeeId(data[0].id)
      }
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadTimeEntries() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      // Calculate date range based on view period
      const today = new Date()
      let fromDate: string
      
      if (viewPeriod === 'week') {
        // Last 7 days
        const weekAgo = new Date(today)
        weekAgo.setDate(today.getDate() - 7)
        fromDate = weekAgo.toISOString().split('T')[0]
      } else {
        // Current month
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        fromDate = firstDay.toISOString().split('T')[0]
      }
      
      const toDate = today.toISOString().split('T')[0]
      
      const res = await fetch(
        `${base}/api/time-entries?employee_id=${selectedEmployeeId}&from=${fromDate}&to=${toDate}`,
        { headers: getAuthHeaders() }
      )
      
      if (!res.ok) throw new Error('Failed to load time entries')
      
      const data = await res.json()
      setTimeEntries(data)
    } catch (e: any) {
      console.error('Failed to load time entries:', e)
    }
  }

  async function handleSave() {
    if (!selectedEmployeeId) {
      alert('Please select an employee')
      return
    }
    if (!workDate) {
      alert('Please select a date')
      return
    }
    if (!startTime || !endTime) {
      alert('Please enter both start and end times')
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/time-entries`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          notes: notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Save failed')
      }

      const result = await res.json()
      
      if (result.created) {
        alert('Time entry saved successfully!')
      } else if (result.updated) {
        alert('Time entry updated successfully!')
      }

      // Reload entries and clear form
      await loadTimeEntries()
      setNotes('')
      // Move to next day
      const nextDay = new Date(workDate)
      nextDay.setDate(nextDay.getDate() + 1)
      setWorkDate(nextDay.toISOString().split('T')[0])
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm('Delete this time entry?')) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/time-entries?id=${entryId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Delete failed')
      }

      alert('Time entry deleted')
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  function handleClear() {
    setWorkDate(todayYMD())
    setStartTime('08:00')
    setEndTime('17:00')
    setNotes('')
  }

  // Calculate total hours for display
  const calculatedHours = useMemo(() => {
    if (!startTime || !endTime) return null
    
    const [startH, startM] = startTime.split(':').map(Number)
    const [endH, endM] = endTime.split(':').map(Number)
    
    let hours = endH - startH
    let minutes = endM - startM
    
    // Handle overnight shift
    if (hours < 0) {
      hours += 24
    }
    
    const totalHours = hours + (minutes / 60)
    return totalHours.toFixed(2)
  }, [startTime, endTime])

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalHours = timeEntries.reduce((sum, entry) => 
      sum + (entry.total_hours || 0), 0
    )
    const approvedHours = timeEntries
      .filter(e => e.approved)
      .reduce((sum, entry) => sum + (entry.total_hours || 0), 0)
    const pendingHours = totalHours - approvedHours
    
    return {
      totalHours: totalHours.toFixed(1),
      approvedHours: approvedHours.toFixed(1),
      pendingHours: pendingHours.toFixed(1),
      daysWorked: timeEntries.length
    }
  }, [timeEntries])

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>
  if (employees.length === 0) return <div className="card"><p>No employees found. Please add employees first.</p></div>

  const CONTROL_H = 44
  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId)

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <h3>Time Entry</h3>

      {/* Employee selector */}
      <div style={{ marginTop: 16 }}>
        <label>Employee</label>
        <select
          value={selectedEmployeeId}
          onChange={e => setSelectedEmployeeId(e.target.value)}
          style={{ height: CONTROL_H }}
        >
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>
              {emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Time entry form */}
      <div className="row row-2col-mobile" style={{ marginTop: 16 }}>
        <div>
          <label>Date</label>
          <input
            type="date"
            value={workDate}
            onChange={e => setWorkDate(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
        <div>
          <label>Total Hours: {calculatedHours || '—'}</label>
          <div style={{ 
            height: CONTROL_H, 
            display: 'flex', 
            alignItems: 'center',
            padding: '0 12px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
            fontSize: 18,
            fontWeight: 600
          }}>
            {calculatedHours || '—'} hrs
          </div>
        </div>
      </div>

      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
        <div>
          <label>End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            style={{ height: CONTROL_H }}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
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
          Save Time Entry
        </button>
        <button
          onClick={handleClear}
          style={{ height: CONTROL_H }}
        >
          Clear
        </button>
      </div>

      {/* Summary Stats */}
      {selectedEmployee && (
        <div style={{ 
          marginTop: 24, 
          padding: 16, 
          background: 'rgba(255,255,255,0.05)', 
          borderRadius: 8 
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 12 
          }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              {selectedEmployee.name}'s Time Summary
            </h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setViewPeriod('week')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  background: viewPeriod === 'week' ? 'var(--primary)' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Week
              </button>
              <button
                onClick={() => setViewPeriod('month')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  background: viewPeriod === 'month' ? 'var(--primary)' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Month
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">Days worked:</span>
              <span style={{ fontWeight: 600 }}>{stats.daysWorked}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">Total hours:</span>
              <span style={{ fontWeight: 600 }}>{stats.totalHours} hrs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">Approved hours:</span>
              <span style={{ fontWeight: 600, color: '#22c55e' }}>{stats.approvedHours} hrs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">Pending approval:</span>
              <span style={{ fontWeight: 600, color: '#fbbf24' }}>{stats.pendingHours} hrs</span>
            </div>
          </div>
        </div>
      )}

      {/* Time entries list */}
      {timeEntries.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
            Recent Time Entries
          </h4>
          <div style={{ 
            display: 'grid', 
            gap: 8,
            maxHeight: 400,
            overflow: 'auto'
          }}>
            {timeEntries.map(entry => (
              <div
                key={entry.id}
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  border: entry.approved ? '1px solid #22c55e33' : '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {new Date(entry.work_date).toLocaleDateString('en-US', { 
                      weekday: 'short',
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {entry.start_time} - {entry.end_time} 
                    <span style={{ margin: '0 8px' }}>•</span>
                    {entry.total_hours?.toFixed(2)} hrs
                  </div>
                  {entry.notes && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {entry.notes}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {entry.approved ? (
                    <span style={{ 
                      fontSize: 12, 
                      color: '#22c55e',
                      fontWeight: 600 
                    }}>
                      ✓ Approved
                    </span>
                  ) : (
                    <>
                      <span style={{ 
                        fontSize: 12, 
                        color: '#fbbf24',
                        fontWeight: 600 
                      }}>
                        Pending
                      </span>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        style={{
                          padding: '4px 8px',
                          fontSize: 12,
                          background: 'transparent',
                          border: '1px solid salmon',
                          borderRadius: 4,
                          color: 'salmon',
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}