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

type Lang = 'es' | 'en'

const translations = {
  es: {
    timeApproval: 'Aprobación de Tiempo',
    employee: 'Empleado',
    allEmployees: 'Todos los Empleados',
    fromDate: 'Desde',
    toDate: 'Hasta',
    showApproved: 'Mostrar aprobados',
    pendingApproval: 'Por Aprobar',
    pendingHours: 'Horas Pendientes',
    approvedHours: 'Horas Aprobadas',
    totalHours: 'Total de Horas',
    selectAll: 'Seleccionar todo',
    selected: 'seleccionado(s)',
    approveSelected: 'Aprobar Seleccionados',
    noEntries: 'No se encontraron entradas de tiempo para los filtros seleccionados.',
    hrs: 'hrs',
    approved: '✓ Aprobado',
    approve: 'Aprobar',
    unapprove: 'Desaprobar',
    note: 'Nota',
    approvedBy: 'Aprobado por',
    on: 'el',
    confirmUnapprove: '¿Desaprobar esta entrada de tiempo? El empleado podrá editarla nuevamente.',
    selectEntries: 'Por favor seleccione entradas de tiempo para aprobar',
    confirmBulk: '¿Aprobar {count} entradas de tiempo?',
    bulkSuccess: '{count} entradas de tiempo aprobadas',
    approvalFailed: 'Error en la aprobación',
    bulkFailed: 'Error en la aprobación masiva',
    loading: 'Cargando…',
    error: 'Error',
  },
  en: {
    timeApproval: 'Time Approval',
    employee: 'Employee',
    allEmployees: 'All Employees',
    fromDate: 'From Date',
    toDate: 'To Date',
    showApproved: 'Show approved',
    pendingApproval: 'Pending Approval',
    pendingHours: 'Pending Hours',
    approvedHours: 'Approved Hours',
    totalHours: 'Total Hours',
    selectAll: 'Select all',
    selected: 'selected',
    approve: 'Approve',
    approveSelected: 'Approve Selected',
    noEntries: 'No time entries found for selected filters.',
    hrs: 'hrs',
    approved: '✓ Approved',
    unapprove: 'Unapprove',
    note: 'Note',
    approvedBy: 'Approved by',
    on: 'on',
    confirmUnapprove: 'Unapprove this time entry? Employee will be able to edit it again.',
    selectEntries: 'Please select time entries to approve',
    confirmBulk: 'Approve {count} time entries?',
    bulkSuccess: '{count} time entries approved',
    approvalFailed: 'Approval failed',
    bulkFailed: 'Bulk approval failed',
    loading: 'Loading…',
    error: 'Error',
  },
}

export default function TimeApproval() {
  const [lang, setLang] = useState<Lang>('es') // Spanish default
  const t = translations[lang]

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Filter state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all')
  const [showApproved, setShowApproved] = useState(false)
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  // Selected entries for bulk approval
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Get current user name for approval tracking
  const [currentUserName, setCurrentUserName] = useState('Manager')

  useEffect(() => {
    loadEmployees()
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
  }, [selectedEmployeeId, dateFrom, dateTo])

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
      
      // Always load ALL entries (approved and pending) for stats calculation
      // Filter display based on showApproved checkbox
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      })
      
      if (!res.ok) throw new Error('Failed to load time entries')
      
      const data = await res.json()
      setTimeEntries(data)
      setSelectedIds(new Set())
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
        throw new Error(errData.error || t.approvalFailed)
      }

      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.approvalFailed)
    }
  }

  async function handleUnapprove(entryId: string) {
    if (!confirm(t.confirmUnapprove)) {
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
        throw new Error(errData.error || t.approvalFailed)
      }

      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.approvalFailed)
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) {
      alert(t.selectEntries)
      return
    }

    if (!confirm(t.confirmBulk.replace('{count}', String(selectedIds.size)))) {
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
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

      alert(t.bulkSuccess.replace('{count}', String(selectedIds.size)))
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.bulkFailed)
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

  // Filter entries to display based on showApproved checkbox
  const displayedEntries = useMemo(() => {
    if (showApproved) {
      return timeEntries // Show all (approved + pending)
    }
    return timeEntries.filter(e => !e.approved) // Show only pending
  }, [timeEntries, showApproved])

  // Group displayed entries by employee
  const entriesByEmployee = useMemo(() => {
    const grouped = new Map<string, TimeEntry[]>()
    
    displayedEntries.forEach(entry => {
      const key = entry.employee_id
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(entry)
    })
    
    return grouped
  }, [displayedEntries])

  // Calculate summary stats from ALL entries (not filtered)
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
    return <div className="card"><p>{t.loading}</p></div>
  }
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>{t.error}: {err}</p></div>

  const CONTROL_H = 44

  return (
    <div className="card" style={{ maxWidth: 1200, position: 'relative' }}>
      {/* Language toggle flags - top right corner */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        <button
          onClick={() => setLang('en')}
          style={{
            width: 40,
            height: 40,
            padding: 0,
            border: lang === 'en' ? '2px solid var(--primary)' : '2px solid transparent',
            borderRadius: 8,
            cursor: 'pointer',
            background: 'transparent',
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="English"
        >
          🇺🇸
        </button>
        <button
          onClick={() => setLang('es')}
          style={{
            width: 40,
            height: 40,
            padding: 0,
            border: lang === 'es' ? '2px solid var(--primary)' : '2px solid transparent',
            borderRadius: 8,
            cursor: 'pointer',
            background: 'transparent',
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Español"
        >
          🇪🇸
        </button>
      </div>

      <h3>{t.timeApproval}</h3>

      {/* Filters - Employee full width, dates below */}
      <div style={{ marginTop: 16 }}>
        <div>
          <label>{t.employee}</label>
          <select
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value)}
            style={{ height: CONTROL_H, width: '100%' }}
          >
            <option value="all">{t.allEmployees}</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ 
          marginTop: 12, 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: 12 
        }}>
          <div>
            <label>{t.fromDate}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ height: CONTROL_H, width: '100%' }}
            />
          </div>
          <div>
            <label>{t.toDate}</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ height: CONTROL_H, width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Summary stats - 2x2 grid */}
      <div style={{ 
        marginTop: 24,
        padding: 16, 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 8 
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: 16, 
          fontSize: 14 
        }}>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>{t.pendingApproval}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#fbbf24' }}>
              {stats.pendingCount}
            </div>
          </div>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>{t.pendingHours}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#fbbf24' }}>
              {stats.pendingHours}
            </div>
          </div>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>{t.approvedHours}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#22c55e' }}>
              {stats.approvedHours}
            </div>
          </div>
          <div>
            <div className="helper" style={{ marginBottom: 4 }}>{t.totalHours}</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>
              {stats.totalHours}
            </div>
          </div>
        </div>
      </div>

      {/* Select all and Show approved - 50/50 row */}
      <div style={{ 
        marginTop: 16, 
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12
      }}>
        {/* Select all */}
        {pendingEntries.length > 0 && (
          <div style={{ 
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
                  ? t.selectAll
                  : `${selectedIds.size} ${t.selected}`}
              </span>
            </label>
            {selectedIds.size > 0 && (
              <button
                className="primary"
                onClick={handleBulkApprove}
                style={{ height: 32, padding: '0 12px', fontSize: 12 }}
              >
                {t.approveSelected} ({selectedIds.size})
              </button>
            )}
          </div>
        )}
        
        {/* Show approved toggle */}
        <div style={{
          padding: 12,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          ...(pendingEntries.length === 0 ? { gridColumn: '1 / -1' } : {})
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showApproved}
              onChange={e => setShowApproved(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span>{t.showApproved}</span>
          </label>
        </div>
      </div>

      {/* Time entries list */}
      <div style={{ marginTop: 24 }}>
        {displayedEntries.length === 0 ? (
          <p className="helper">
            {t.noEntries}
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
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
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
                              {entry.total_hours?.toFixed(2)} {t.hrs}
                            </div>
                            {entry.notes && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                {t.note}: {entry.notes}
                              </div>
                            )}
                            {entry.approved && entry.approved_by && (
                              <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>
                                {t.approvedBy} {entry.approved_by} {t.on} {new Date(entry.approved_at!).toLocaleDateString()}
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
                                {t.approved}
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
                                {t.unapprove}
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
                              {t.approve}
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