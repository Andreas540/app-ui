import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
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
  start_time: string | null
  end_time: string | null
  total_hours: number | string | null
  salary: number | string | null
  approved: boolean
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type Language = 'es' | 'en'

const translations = {
  en: {
    timeEntry: 'Time Entry',
    reportingAs: 'Reporting as',
    today: 'Today',
    clockIn: 'Clock In',
    clockOut: 'Clock Out',
    clockedInAt: 'Clocked in at',
    clockedOutAt: 'Clocked out at',
    timeSummary: 'Time Summary',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    daysWorked: 'Days worked:',
    totalHours: 'Total hours:',
    totalEarnings: 'Total earnings:',
    approvedHours: 'Approved hours:',
    pendingHours: 'Pending hours:',
    recentEntries: 'Recent Time Entries',
    approved: 'Approved',
    pending: 'Pending',
    hours: 'hrs',
    loading: 'Loading…',
    error: 'Error:',
    employeeInactive: 'Employee is inactive',
    employeeNotFound: 'Employee not found',
    clockInSuccess: 'Clocked in successfully!',
    clockOutSuccess: 'Clocked out successfully!',
    saveFailed: 'Save failed',
    missingToken: 'Missing employee token',
  },
  es: {
    timeEntry: 'Registro de Tiempo',
    reportingAs: 'Reportando como',
    today: 'Hoy',
    clockIn: 'Entrada',
    clockOut: 'Salida',
    clockedInAt: 'Entrada a las',
    clockedOutAt: 'Salida a las',
    timeSummary: 'Resumen de Tiempo',
    thisWeek: 'Esta semana',
    lastWeek: 'Semana pasada',
    daysWorked: 'Días trabajados:',
    totalHours: 'Horas totales:',
    totalEarnings: 'Ganancias totales:',
    approvedHours: 'Horas aprobadas:',
    pendingHours: 'Horas pendientes:',
    recentEntries: 'Entradas Recientes',
    approved: 'Aprobado',
    pending: 'Pendiente',
    hours: 'hrs',
    loading: 'Cargando…',
    error: 'Error:',
    employeeInactive: 'Empleado está inactivo',
    employeeNotFound: 'Empleado no encontrado',
    clockInSuccess: '¡Entrada registrada exitosamente!',
    clockOutSuccess: '¡Salida registrada exitosamente!',
    saveFailed: 'Error al guardar',
    missingToken: 'Falta el token del empleado',
  },
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// Get current time in HH:MM format (EST/EDT)
function getCurrentTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Get Monday of current week
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  return new Date(d.setDate(diff))
}

function getStoredEmployeeToken(): string | null {
  try {
    return localStorage.getItem('employee_token')
  } catch {
    return null
  }
}

function saveEmployeeToken(token: string) {
  try {
    localStorage.setItem('employee_token', token)
  } catch {}
}

export default function TimeEntrySimple() {
  const [lang, setLang] = useState<Language>('es')
  const t = translations[lang]

  const { token } = useParams<{ token?: string }>()
  const employeeToken = token || getStoredEmployeeToken()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Today's entry state
  const [clockInTime, setClockInTime] = useState<string | null>(null)
  const [clockOutTime, setClockOutTime] = useState<string | null>(null)

  // Time entries list
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [viewPeriod, setViewPeriod] = useState<'thisWeek' | 'lastWeek'>('thisWeek')

  function apiBase() {
    return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  }

  function headersFor() {
    return {
      'x-employee-token': employeeToken as string,
    }
  }

  // Save token from path to storage for PWA relaunch
  useEffect(() => {
    if (token) saveEmployeeToken(token)
  }, [token])

  useEffect(() => {
    loadEmployeeAndToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (employee) {
      loadTimeEntries()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, viewPeriod])

  async function loadEmployeeAndToday() {
    try {
      setLoading(true)
      setErr(null)

      if (!employeeToken) {
        throw new Error(t.missingToken)
      }

      const base = apiBase()
      const res = await fetch(`${base}/api/time-entries?me=true`, {
        headers: headersFor(),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || t.employeeNotFound)
      }

      const j = await res.json()
      const emp: Employee | null = j?.employee || null
      if (!emp) throw new Error(t.employeeNotFound)
      if (!emp.active) throw new Error(t.employeeInactive)

      setEmployee(emp)

      // Load today's entry if it exists
      await loadTodayEntry()
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadTodayEntry() {
    try {
      if (!employeeToken) return

      const base = apiBase()
      const today = todayYMD()

      const res = await fetch(`${base}/api/time-entries?from=${today}&to=${today}`, {
        headers: headersFor(),
      })

      if (!res.ok) return

      const data = await res.json()
      if (data.length > 0) {
        const entry = data[0]
        setClockInTime(entry.start_time)
        setClockOutTime(entry.end_time)
      }
    } catch (e: any) {
      console.error('Failed to load today entry:', e)
    }
  }

  async function loadTimeEntries() {
    try {
      if (!employeeToken) return

      const base = apiBase()

      // Calculate date range based on viewPeriod
      const today = new Date()
      let fromDate: Date
      let toDate: Date

      if (viewPeriod === 'thisWeek') {
        fromDate = getMondayOfWeek(today)
        toDate = new Date(fromDate)
        toDate.setDate(toDate.getDate() + 6) // Sunday
      } else {
        // Last week
        const lastWeekDate = new Date(today)
        lastWeekDate.setDate(today.getDate() - 7)
        fromDate = getMondayOfWeek(lastWeekDate)
        toDate = new Date(fromDate)
        toDate.setDate(toDate.getDate() + 6) // Sunday
      }

      const from = fromDate.toISOString().split('T')[0]
      const to = toDate.toISOString().split('T')[0]

      const res = await fetch(`${base}/api/time-entries?from=${from}&to=${to}`, {
        headers: headersFor(),
      })

      if (!res.ok) {
        throw new Error('Failed to load time entries')
      }

      const data = await res.json()
      setTimeEntries(data)
    } catch (e: any) {
      console.error('Failed to load time entries:', e)
    }
  }

  async function handleClockIn() {
    if (!employee || !employeeToken) return

    try {
      const base = apiBase()
      const currentTime = getCurrentTime()
      const today = todayYMD()

      const res = await fetch(`${base}/api/time-entries`, {
        method: 'POST',
        headers: {
          ...headersFor(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          employee_id: employee.id,
          work_date: today,
          start_time: currentTime,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.saveFailed)
      }

      setClockInTime(currentTime)
      alert(t.clockInSuccess)
      await loadTodayEntry()
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    }
  }

  async function handleClockOut() {
    if (!employee || !employeeToken) return

    try {
      const base = apiBase()
      const currentTime = getCurrentTime()
      const today = todayYMD()

      const res = await fetch(`${base}/api/time-entries`, {
        method: 'POST',
        headers: {
          ...headersFor(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          employee_id: employee.id,
          work_date: today,
          end_time: currentTime,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.saveFailed)
      }

      setClockOutTime(currentTime)
      alert(t.clockOutSuccess)
      await loadTodayEntry()
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    }
  }

  const stats = useMemo(() => {
    const totalHoursNum = timeEntries.reduce((sum, entry) => {
      const h = toNumberOrNull(entry.total_hours) || 0
      return sum + h
    }, 0)

    const totalEarningsNum = timeEntries.reduce((sum, entry) => {
      const s = toNumberOrNull(entry.salary) || 0
      return sum + s
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
      totalEarnings: totalEarningsNum.toFixed(2),
      approvedHours: approvedHoursNum.toFixed(1),
      pendingHours: pendingHoursNum.toFixed(1),
      daysWorked: timeEntries.filter(e => e.end_time !== null).length,
    }
  }, [timeEntries])

  if (loading) return <div className="card"><p>{t.loading}</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>{t.error} {err}</p></div>
  if (!employee) return <div className="card"><p>{t.employeeNotFound}</p></div>

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{t.timeEntry}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setLang('en')}
            style={{
              fontSize: 20,
              padding: '4px 8px',
              background: lang === 'en' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              opacity: lang === 'en' ? 1 : 0.5,
            }}
            title="English"
          >
            🇺🇸
          </button>
          <button
            onClick={() => setLang('es')}
            style={{
              fontSize: 20,
              padding: '4px 8px',
              background: lang === 'es' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              opacity: lang === 'es' ? 1 : 0.5,
            }}
            title="Español"
          >
            🇪🇸
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
        {t.reportingAs} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{employee.name}</span>
        {employee.employee_code ? ` (${employee.employee_code})` : ''}
      </div>

      <div style={{ marginTop: 24, padding: 20, background: 'rgba(255,255,255,0.05)', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          {t.today} - {formatLongDate(todayYMD(), lang === 'es' ? 'es-ES' : 'en-US')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
          <div>
            <button
              className="primary"
              onClick={handleClockIn}
              disabled={!!clockOutTime}
              style={{
                width: '100%',
                height: 60,
                fontSize: 16,
                opacity: clockOutTime ? 0.5 : 1,
                cursor: clockOutTime ? 'not-allowed' : 'pointer',
              }}
            >
              {t.clockIn}
            </button>
            {clockInTime && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#22c55e', fontWeight: 600 }}>
                {t.clockedInAt} {clockInTime}
              </div>
            )}
          </div>

          <div>
            <button
              className="primary"
              onClick={handleClockOut}
              disabled={!clockInTime || !!clockOutTime}
              style={{
                width: '100%',
                height: 60,
                fontSize: 16,
                opacity: !clockInTime || clockOutTime ? 0.5 : 1,
                cursor: !clockInTime || clockOutTime ? 'not-allowed' : 'pointer',
              }}
            >
              {t.clockOut}
            </button>
            {clockOutTime && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#22c55e', fontWeight: 600 }}>
                {t.clockedOutAt} {clockOutTime}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t.timeSummary}</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setViewPeriod('thisWeek')}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                background: viewPeriod === 'thisWeek' ? 'var(--primary)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t.thisWeek}
            </button>
            <button
              onClick={() => setViewPeriod('lastWeek')}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                background: viewPeriod === 'lastWeek' ? 'var(--primary)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t.lastWeek}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t.daysWorked}</span>
            <span style={{ fontWeight: 600 }}>{stats.daysWorked}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t.totalHours}</span>
            <span style={{ fontWeight: 600 }}>
              {stats.totalHours} {t.hours}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t.approvedHours}</span>
            <span style={{ fontWeight: 600, color: '#22c55e' }}>
              {stats.approvedHours} {t.hours}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t.pendingHours}</span>
            <span style={{ fontWeight: 600, color: '#fbbf24' }}>
              {stats.pendingHours} {t.hours}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="helper">{t.totalEarnings}</span>
            <span style={{ fontWeight: 600 }}>${stats.totalEarnings}</span>
          </div>
        </div>
      </div>

      {timeEntries.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t.recentEntries}</h4>
          <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflow: 'auto' }}>
            {timeEntries.map(entry => {
              const hours = toNumberOrNull(entry.total_hours)
              const salary = toNumberOrNull(entry.salary)
              const hasCompleteTime = entry.start_time && entry.end_time

              return (
                <div
                  key={entry.id}
                  style={{
                    padding: 12,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: entry.approved ? '1px solid #22c55e33' : '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {formatLongDate(entry.work_date, lang === 'es' ? 'es-ES' : 'en-US')}
                  </div>

                  {hasCompleteTime ? (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {entry.start_time} - {entry.end_time}
                        <span style={{ margin: '0 8px' }}>•</span>
                        {hours === null ? '—' : hours.toFixed(2)} {t.hours}
                      </div>
                      {salary !== null && (
                        <div style={{ fontSize: 13, color: '#22c55e', marginTop: 4 }}>
                          ${salary.toFixed(2)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {entry.start_time ? `${t.clockedInAt} ${entry.start_time}` : t.pending}
                    </div>
                  )}

                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>
                    {entry.approved ? (
                      <span style={{ color: '#22c55e' }}>✓ {t.approved}</span>
                    ) : (
                      <span style={{ color: '#fbbf24' }}>{t.pending}</span>
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
