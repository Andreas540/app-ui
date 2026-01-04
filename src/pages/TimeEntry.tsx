import { useEffect, useMemo, useState } from 'react'
import { getAuthHeaders } from '../lib/api'
import { todayYMD, formatLongDate } from '../lib/time'

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
  total_hours: number | string | null
  approved: boolean
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type Lang = 'es' | 'en'

const translations = {
  es: {
    timeEntry: 'Entrada de Tiempo',
    employee: 'Empleado',
    reportingAs: 'Reportando como',
    date: 'Fecha',
    totalHours: 'Total de Horas',
    startTime: 'Hora de Inicio',
    endTime: 'Hora de Fin',
    notes: 'Notas (opcional)',
    notesPlaceholder: 'Notas opcionales...',
    saveEntry: 'Guardar Entrada',
    clear: 'Limpiar',
    timeSummary: 'Resumen de Tiempo de',
    week: 'Semana',
    month: 'Mes',
    daysWorked: 'Días trabajados:',
    totalHoursLabel: 'Total de horas:',
    approvedHours: 'Horas aprobadas:',
    pendingApproval: 'Pendiente de aprobación:',
    recentEntries: 'Entradas Recientes',
    approved: '✓ Aprobado',
    pending: 'Pendiente',
    delete: 'Eliminar',
    hrs: 'hrs',
    loading: 'Cargando…',
    error: 'Error',
    noEmployees: 'No se encontraron empleados. Por favor agregue empleados primero.',
    employeeMissing: 'Empleado faltante',
    selectDate: 'Por favor seleccione una fecha',
    enterTimes: 'Por favor ingrese hora de inicio y fin',
    saveFailed: 'Error al guardar',
    entrySaved: '¡Entrada de tiempo guardada exitosamente!',
    entryUpdated: '¡Entrada de tiempo actualizada exitosamente!',
    confirmDelete: '¿Eliminar esta entrada de tiempo?',
    entryDeleted: 'Entrada de tiempo eliminada',
    deleteFailed: 'Error al eliminar',
  },
  en: {
    timeEntry: 'Time Entry',
    employee: 'Employee',
    reportingAs: 'Reporting as',
    date: 'Date',
    totalHours: 'Total Hours',
    startTime: 'Start Time',
    endTime: 'End Time',
    notes: 'Notes (optional)',
    notesPlaceholder: 'Optional notes...',
    saveEntry: 'Save Time Entry',
    clear: 'Clear',
    timeSummary: 'Time Summary for',
    week: 'Week',
    month: 'Month',
    daysWorked: 'Days worked:',
    totalHoursLabel: 'Total hours:',
    approvedHours: 'Approved hours:',
    pendingApproval: 'Pending approval:',
    recentEntries: 'Recent Time Entries',
    approved: '✓ Approved',
    pending: 'Pending',
    delete: 'Delete',
    hrs: 'hrs',
    loading: 'Loading…',
    error: 'Error',
    noEmployees: 'No employees found. Please add employees first.',
    employeeMissing: 'Employee missing',
    selectDate: 'Please select a date',
    enterTimes: 'Please enter both start and end times',
    saveFailed: 'Save failed',
    entrySaved: 'Time entry saved successfully!',
    entryUpdated: 'Time entry updated successfully!',
    confirmDelete: 'Delete this time entry?',
    entryDeleted: 'Time entry deleted',
    deleteFailed: 'Delete failed',
  },
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function getEmployeeTokenFromUrl(): string | null {
  try {
    const qsToken = new URLSearchParams(window.location.search).get('employee_token')
    if (qsToken) return qsToken

    const hash = window.location.hash || ''
    const hashPart = hash.startsWith('#') ? hash.slice(1) : hash
    const hashQuery = hashPart.includes('?') ? hashPart.split('?')[1] : ''
    const hashToken = new URLSearchParams(hashQuery).get('employee_token')
    return hashToken
  } catch {
    return null
  }
}

export default function TimeEntry() {
  const employeeToken = getEmployeeTokenFromUrl()
  const employeeMode = !!employeeToken

  const [lang, setLang] = useState<Lang>('es') // Spanish default
  const t = translations[lang]

  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeMe, setEmployeeMe] = useState<Employee | null>(null)

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(todayYMD())
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [notes, setNotes] = useState('')

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [viewPeriod, setViewPeriod] = useState<'week' | 'month'>('week')

  function apiBase() {
    return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  }

  function headersFor(mode: 'app' | 'employee') {
    if (mode === 'employee') {
      return {
        'x-employee-token': employeeToken as string,
      }
    }
    return getAuthHeaders()
  }

  useEffect(() => {
    if (employeeMode) {
      loadEmployeeMe()
    } else {
      loadEmployees()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedEmployeeId) {
      loadTimeEntries()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, viewPeriod])

  async function loadEmployeeMe() {
    try {
      setLoading(true)
      setErr(null)

      const base = apiBase()
      const headers = headersFor('employee')

      const res = await fetch(`${base}/api/time-entries?me=true`, {
        headers,
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to load employee')
      }

      const j = await res.json()
      const emp: Employee | null = j?.employee || null
      if (!emp) throw new Error('Employee not found')

      if (!emp.active) throw new Error('Employee is inactive')

      setEmployeeMe(emp)
      setSelectedEmployeeId(emp.id)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadEmployees() {
    try {
      setLoading(true)
      setErr(null)

      const base = apiBase()
      const res = await fetch(`${base}/api/employees?active=true`, {
        headers: headersFor('app'),
      })

      if (!res.ok) throw new Error('Failed to load employees')

      const data = await res.json()
      setEmployees(data)

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
      const base = apiBase()

      const today = new Date()
      let fromDate: string

      if (viewPeriod === 'week') {
        const weekAgo = new Date(today)
        weekAgo.setDate(today.getDate() - 7)
        fromDate = weekAgo.toISOString().split('T')[0]
      } else {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        fromDate = firstDay.toISOString().split('T')[0]
      }

      const toDate = today.toISOString().split('T')[0]

      const mode = employeeMode ? 'employee' : 'app'
      const qs = employeeMode
        ? `from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
        : `employee_id=${encodeURIComponent(selectedEmployeeId)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`

      const res = await fetch(`${base}/api/time-entries?${qs}`, {
        headers: headersFor(mode),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to load time entries (${res.status})`)
      }

      const data = await res.json()
      setTimeEntries(data)
      setErr(null)
    } catch (e: any) {
      console.error('Failed to load time entries:', e)
      setErr(e?.message || 'Failed to load time entries')
    }
  }

  async function handleSave() {
    if (!selectedEmployeeId) {
      alert(t.employeeMissing)
      return
    }
    if (!workDate) {
      alert(t.selectDate)
      return
    }
    if (!startTime || !endTime) {
      alert(t.enterTimes)
      return
    }

    try {
      const base = apiBase()
      const mode = employeeMode ? 'employee' : 'app'

      const res = await fetch(`${base}/api/time-entries`, {
        method: 'POST',
        headers: {
          ...headersFor(mode),
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
        throw new Error(errData.error || t.saveFailed)
      }

      const result = await res.json()
      if (result.created) alert(t.entrySaved)
      else if (result.updated) alert(t.entryUpdated)

      await loadTimeEntries()
      setNotes('')

      const nextDay = new Date(workDate)
      nextDay.setDate(nextDay.getDate() + 1)
      setWorkDate(nextDay.toISOString().split('T')[0])
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm(t.confirmDelete)) return

    try {
      const base = apiBase()
      const mode = employeeMode ? 'employee' : 'app'

      const res = await fetch(`${base}/api/time-entries?id=${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
        headers: headersFor(mode),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.deleteFailed)
      }

      alert(t.entryDeleted)
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.deleteFailed)
    }
  }

  function handleClear() {
    setWorkDate(todayYMD())
    setStartTime('08:00')
    setEndTime('17:00')
    setNotes('')
  }

  const calculatedHours = useMemo(() => {
    if (!startTime || !endTime) return null

    const [startH, startM] = startTime.split(':').map(Number)
    const [endH, endM] = endTime.split(':').map(Number)

    let hours = endH - startH
    let minutes = endM - startM

    if (hours < 0) hours += 24

    const totalHours = hours + minutes / 60
    return totalHours.toFixed(2)
  }, [startTime, endTime])

  const stats = useMemo(() => {
    const totalHoursNum = timeEntries.reduce((sum, entry) => {
      const h = toNumberOrNull(entry.total_hours) || 0
      return sum + h
    }, 0)

    const approvedHoursNum = timeEntries
      .filter(e => e.approved)
      .reduce((sum, entry) => {
        const h = toNumberOrNull(entry.total_hours) || 0
        return sum + h
      }, 0)

    const pendingHoursNum = totalHoursNum - approvedHoursNum

    return {
      totalHours: totalHoursNum.toFixed(1),
      approvedHours: approvedHoursNum.toFixed(1),
      pendingHours: pendingHoursNum.toFixed(1),
      daysWorked: timeEntries.length,
    }
  }, [timeEntries])

  if (loading) return <div className="card"><p>{t.loading}</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>{t.error}: {err}</p></div>

  const CONTROL_H = 44

  const selectedEmployee = employeeMode
    ? employeeMe
    : employees.find(e => e.id === selectedEmployeeId)

  if (!employeeMode && employees.length === 0) {
    return <div className="card"><p>{t.noEmployees}</p></div>
  }

  return (
    <div className="card" style={{ maxWidth: 900, position: 'relative' }}>
      {/* Language toggle flags - top right corner */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
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
      </div>

      <h3>{t.timeEntry}</h3>

      {!employeeMode && (
        <div style={{ marginTop: 16 }}>
          <label>{t.employee}</label>
          <select
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value)}
            style={{ height: CONTROL_H, width: '100%' }}
          >
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} {emp.employee_code ? `(${emp.employee_code})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {employeeMode && selectedEmployee && (
        <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
          {t.reportingAs} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{selectedEmployee.name}</span>
          {selectedEmployee.employee_code ? ` (${selectedEmployee.employee_code})` : ''}
        </div>
      )}

      <div className="row row-2col-mobile" style={{ marginTop: 16 }}>
        <div>
          <label>{t.date}</label>
          <input
            type="date"
            value={workDate}
            onChange={e => setWorkDate(e.target.value)}
            style={{ height: CONTROL_H, width: '100%' }}
          />
        </div>
        <div>
          <label>{t.totalHours}: {calculatedHours || '—'}</label>
          <div
            style={{
              height: CONTROL_H,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              width: '100%',
            }}
          >
            {calculatedHours || '—'} {t.hrs}
          </div>
        </div>
      </div>

      <div style={{ 
  marginTop: 12, 
  display: 'grid', 
  gridTemplateColumns: '1fr 1fr', 
  gap: 12 
}}>
  <div>
    <label>{t.startTime}</label>
    <input
      type="text"
      inputMode="numeric"
      placeholder="08:00"
      value={startTime}
      onChange={e => {
        let val = e.target.value.replace(/[^\d]/g, '') // Remove everything except digits
        
        if (val.length >= 2) {
          val = val.slice(0, 2) + ':' + val.slice(2, 4)
        }
        
        if (val.length <= 5) {
          setStartTime(val)
        }
      }}
      onBlur={e => {
        // Ensure proper format on blur
        const digits = e.target.value.replace(/[^\d]/g, '')
        if (digits.length === 4) {
          const h = digits.slice(0, 2)
          const m = digits.slice(2, 4)
          setStartTime(`${h}:${m}`)
        } else if (digits.length < 4 && digits.length > 0) {
          // Pad with zeros if incomplete
          setStartTime('08:00')
        }
      }}
      style={{ 
        height: CONTROL_H, 
        width: '100%', 
        boxSizing: 'border-box',
        letterSpacing: '0.05em'
      }}
    />
  </div>
  <div>
    <label>{t.endTime}</label>
    <input
      type="text"
      inputMode="numeric"
      placeholder="17:00"
      value={endTime}
      onChange={e => {
        let val = e.target.value.replace(/[^\d]/g, '') // Remove everything except digits
        
        if (val.length >= 2) {
          val = val.slice(0, 2) + ':' + val.slice(2, 4)
        }
        
        if (val.length <= 5) {
          setEndTime(val)
        }
      }}
      onBlur={e => {
        // Ensure proper format on blur
        const digits = e.target.value.replace(/[^\d]/g, '')
        if (digits.length === 4) {
          const h = digits.slice(0, 2)
          const m = digits.slice(2, 4)
          setEndTime(`${h}:${m}`)
        } else if (digits.length < 4 && digits.length > 0) {
          // Pad with zeros if incomplete
          setEndTime('17:00')
        }
      }}
      style={{ 
        height: CONTROL_H, 
        width: '100%', 
        boxSizing: 'border-box',
        letterSpacing: '0.05em'
      }}
    />
  </div>
</div>

      <div style={{ marginTop: 12 }}>
        <label>{t.notes}</label>
        <input
          type="text"
          placeholder={t.notesPlaceholder}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ height: CONTROL_H, width: '100%' }}
        />
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={handleSave} style={{ height: CONTROL_H, flex: 1 }}>
          {t.saveEntry}
        </button>
        <button onClick={handleClear} style={{ height: CONTROL_H, flex: 1 }}>
          {t.clear}
        </button>
      </div>

      {selectedEmployee && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              {t.timeSummary} {selectedEmployee.name}
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
                  cursor: 'pointer',
                }}
              >
                {t.week}
              </button>
              <button
                onClick={() => setViewPeriod('month')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  background: viewPeriod === 'month' ? 'var(--primary)' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {t.month}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t.daysWorked}</span>
              <span style={{ fontWeight: 600 }}>{stats.daysWorked}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t.totalHoursLabel}</span>
              <span style={{ fontWeight: 600 }}>{stats.totalHours} {t.hrs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t.approvedHours}</span>
              <span style={{ fontWeight: 600, color: '#22c55e' }}>{stats.approvedHours} {t.hrs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t.pendingApproval}</span>
              <span style={{ fontWeight: 600, color: '#fbbf24' }}>{stats.pendingHours} {t.hrs}</span>
            </div>
          </div>
        </div>
      )}

      {timeEntries.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t.recentEntries}</h4>
          <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflow: 'auto' }}>
            {timeEntries.map(entry => {
              const hours = toNumberOrNull(entry.total_hours)
              return (
                <div
                  key={entry.id}
                  style={{
                    padding: 12,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: entry.approved ? '1px solid #22c55e33' : '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {formatLongDate(entry.work_date)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {entry.start_time} - {entry.end_time}
                      <span style={{ margin: '0 8px' }}>•</span>
                      {hours === null ? '—' : hours.toFixed(2)} {t.hrs}
                    </div>
                    {entry.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {entry.notes}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {entry.approved ? (
                      <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>{t.approved}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>{t.pending}</span>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 12,
                            background: 'transparent',
                            border: '1px solid salmon',
                            borderRadius: 4,
                            color: 'salmon',
                            cursor: 'pointer',
                          }}
                        >
                          {t.delete}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}



