// src/pages/TimeApproval.tsx
import { useEffect, useState, useMemo } from 'react'
import { getAuthHeaders } from '../lib/api'
import { formatLongDate } from '../lib/time'

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
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type Employee = {
  id: string
  name: string
  employee_code: string | null
}

export default function TimeApproval() {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Filter state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all')
  const [showApproved, setShowApproved] = useState(false)
  const [dateFrom, setDateFrom] = useState(() => {
    // Default to start of current month
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    // Default to today
    return new Date().toISOString().split('T')[0]
  })

  // Selected entries for bulk approval
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Get current user name for approval tracking
  const [currentUserName, setCurrentUserName] = useState('Manager')

  useEffect(() => {
    loadEmployees()
    // Get current user name from localStorage
    try {
      const userData = localStorage.getItem('userData')
      if (userData) {
        const user = JSON.parse(userData)
        if (user.name) setCurrentUserName(user.name)
      }
    } catch (e) {
      console.error('Failed to get user name:', e)
    }
  }, [])

  useEffect(() => {
    loadTimeEntries()
  }, [selectedEmployeeId, showApproved, dateFrom, dateTo])

  async function loadEmployees() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees?active=true`, {
        headers: getAuthHeaders(),
      })
      
      if (!res.ok) throw new Error('Failed to load employees')
      
      const data = await res.json()
      setEmployees(data)
    } catch (e: any) {
      console.error('Failed to load employees:', e)
    }
  }

  async function loadTimeEntries() {
    try {
      setLoading(true)
      setErr(null)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      let url = `${base}/api/time-entries?from=${dateFrom}&to=${dateTo}`
      
      if (selectedEmployeeId !== 'all') {
        url += `&employee_id=${selectedEmployeeId}`
      }
      
      if (!showApproved) {
        url += '&approved=false'
      }
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      })
      
      if (!res.ok) throw new Error('Failed to load time entries')
      
      const data = await res.json()
      setTimeEntries(data)
      setSelectedIds(new Set()) // Clear selections when reloading
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(entryId: string) {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/time-entries-approve`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: entryId,
          approved: true,
          approved_by: currentUserName,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Approval failed')
      }

      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || 'Approval failed')
    }
  }

  async function handleUnapprove(entryId: string) {
    if (!confirm('Unapprove this time entry? Employee will be able to edit it again.')) {
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/time-entries-approve`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: entryId,
          approved: false,
          approved_by: null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Unapprove failed')
      }

      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || 'Unapprove failed')
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) {
      alert('Please select time entries to approve')
      return
    }

    if (!confirm(`Approve ${selectedIds.size} time entries?`)) {
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      // Approve each selected entry
      for (const id of selectedIds) {
        await fetch(`${base}/api/time-entries-approve`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id,
            approved: true,
            approved_by: currentUserName,
          }),
        })
      }

      alert(`${selectedIds.size} time entries approved`)
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || 'Bulk approval failed')
    }
  }

  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  function toggleSelectAll() {
    if (selectedIds.size === pendingEntries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingEntries.map(e => e.id)))
    }
  }

  // Group entries by employee
  const entriesByEmployee = useMemo(() => {
    const grouped = new Map<string, TimeEntry[]>()
    
    timeEntries.forEach(entry => {
      const key = entry.employee_id
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(entry)
    })
    
    return grouped
  }, [timeEntries])

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalHours = timeEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0)
    const approvedHours = timeEntries.filter(e => e.approved).reduce((sum, e) => sum + (e.total_hours || 0), 0)
    const pendingHours = totalHours - approvedHours
    const pendingCount = timeEntries.filter(e => !e.approved).length
    
    return {
      totalHours: totalHours.toFixed(1),
      approvedHours: approvedHours.toFixed(1),
      pendingHours: pendingHours.toFixed(1),
      pendingCount,
      totalCount: timeEntries.length
    }
  }, [timeEntries])

  const pendingEntries = timeEntries.filter(e => !e.approved)

  if (loading && timeEntries.length === 0) {
    return <div className="card"><p>Loading…</p></div>
  }
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>

  const CONTROL_H = 44

  return (
    <div className="card" style={{ maxWidth: 1200 }}>
      <h3>Time Approval</h3>

      {/* Summary stats */}
      <div style={{ 
        marginTop: 16,
        padding: 16, 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 8 
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, fontSize: 14 }}>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>Pending Approval</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#fbbf24' }}>
              {stats.pendingCount}
            </div>
          </div>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>Pending Hours</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#fbbf24' }}>
              {stats.pendingHours}
            </div>
          </div>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>Approved Hours</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#22c55e' }}>
              {stats.approvedHours}
            </div>
          </div>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>Total Hours</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>
              {stats.totalHours}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginTop: 24 }}>
        <div className="row row-2col-mobile">
          <div>
            <label>Employee</label>
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              style={{ height: CONTROL_H }}
            >
              <option value="all">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', height: CONTROL_H }}>
              <input
                type="checkbox"
                checked={showApproved}
                onChange={e => setShowApproved(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>Show approved entries</span>
            </label>
          </div>
        </div>

        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
          <div>
            <label>From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
          <div>
            <label>To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {!showApproved && pendingEntries.length > 0 && (
        <div style={{ 
          marginTop: 16, 
          padding: 12,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedIds.size === pendingEntries.length && pendingEntries.length > 0}
              onChange={toggleSelectAll}
              style={{ width: 18, height: 18 }}
            />
            <span>
              {selectedIds.size === 0 
                ? 'Select all' 
                : `${selectedIds.size} selected`}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <button
              className="primary"
              onClick={handleBulkApprove}
              style={{ height: 36, padding: '0 16px' }}
            >
              Approve Selected ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* Time entries list */}
      <div style={{ marginTop: 24 }}>
        {timeEntries.length === 0 ? (
          <p className="helper">
            No time entries found for selected filters.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {Array.from(entriesByEmployee.entries()).map(([employeeId, entries]) => {
              const employee = employees.find(e => e.id === employeeId)
              const employeeName = entries[0]?.employee_name || 'Unknown'
              const employeeCode = employee?.employee_code
              
              return (
                <div key={employeeId} style={{
                  padding: 16,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  border: '1px solid var(--border)'
                }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>
                    {employeeName}
                    {employeeCode && (
                      <span style={{ 
                        marginLeft: 8, 
                        fontSize: 13, 
                        color: 'var(--text-secondary)',
                        fontWeight: 400
                      }}>
                        {employeeCode}
                      </span>
                    )}
                  </h4>
                  
                  <div style={{ display: 'grid', gap: 8 }}>
                    {entries.map(entry => (
                      <div
                        key={entry.id}
                        style={{
                          padding: 12,
                          background: entry.approved 
                            ? 'rgba(34, 197, 94, 0.05)' 
                            : 'rgba(255,255,255,0.02)',
                          borderRadius: 6,
                          border: entry.approved 
                            ? '1px solid rgba(34, 197, 94, 0.2)' 
                            : '1px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          {!entry.approved && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.id)}
                              onChange={() => toggleSelection(entry.id)}
                              style={{ width: 18, height: 18 }}
                            />
                          )}
                          
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
  {formatLongDate(entry.work_date)}
  {', '}
  {(() => {
    const [year] = entry.work_date.split('-')
    return year
  })()}
</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              {entry.start_time} - {entry.end_time}
                              <span style={{ margin: '0 8px' }}>•</span>
                              {entry.total_hours?.toFixed(2)} hrs
                            </div>
                            {entry.notes && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                Note: {entry.notes}
                              </div>
                            )}
                            {entry.approved && entry.approved_by && (
                              <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>
                                Approved by {entry.approved_by} on {new Date(entry.approved_at!).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: 8 }}>
                          {entry.approved ? (
                            <>
                              <span style={{ 
                                fontSize: 13, 
                                color: '#22c55e',
                                fontWeight: 600,
                                padding: '6px 12px'
                              }}>
                                ✓ Approved
                              </span>
                              <button
                                onClick={() => handleUnapprove(entry.id)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  height: 32,
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  cursor: 'pointer'
                                }}
                              >
                                Unapprove
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleApprove(entry.id)}
                              className="primary"
                              style={{
                                padding: '6px 16px',
                                fontSize: 13,
                                height: 32
                              }}
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}