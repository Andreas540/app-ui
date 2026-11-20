// src/pages/TimeEntrySimple.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { todayYMD, formatLongDate } from '../lib/time'

type Employee = {
  id: string
  name: string
  employee_code: string | null
  active: boolean
  /** The business's timezone. Decides which day "today" is for an employee whose
   *  phone is set elsewhere. Clock and break TIMES come from the server, not here. */
  timezone: string | null
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
  /** Unpaid minutes the database has already taken off total_hours. */
  break_minutes: number | string | null
  /** Set only while a break is running right now. */
  on_break_since: string | null
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
    noSession: 'Session missing. Please open your personal link again.',
    startBreak: 'Start Break',
    endBreak: 'End Break',
    onBreakSince: 'On break since',
    breaks: 'Breaks:',
    businessTime: 'All times shown in business time',
    endBreakFirst: 'End your break before clocking out.',
    errNotClockedIn: 'Clock in first.',
    errAlreadyClockedOut: 'You have already clocked out for today.',
    errBreakOpen: 'A break is already running.',
    errNoOpenBreak: 'No break is running.',
    errEntryApproved: 'Today is already approved and cannot be changed.',
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
    noSession: 'Falta la sesión. Abre tu enlace personal otra vez.',
    startBreak: 'Iniciar Descanso',
    endBreak: 'Terminar Descanso',
    onBreakSince: 'En descanso desde',
    breaks: 'Descansos:',
    businessTime: 'Todas las horas se muestran en la hora del negocio',
    endBreakFirst: 'Termina tu descanso antes de marcar salida.',
    errNotClockedIn: 'Primero marca entrada.',
    errAlreadyClockedOut: 'Ya marcaste salida hoy.',
    errBreakOpen: 'Ya hay un descanso en curso.',
    errNoOpenBreak: 'No hay ningún descanso en curso.',
    errEntryApproved: 'El día de hoy ya está aprobado y no se puede cambiar.',
  },
} as const

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function formatHoursMinutes(decimalHours: number, lang: Language): string {
  const totalMinutes = Math.round(decimalHours * 60) // Round to nearest minute first
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  if (lang === 'es') {
    if (hours === 0) return `${minutes} min`
    if (minutes === 0) return `${hours} hrs`
    return `${hours} hrs ${minutes} min`
  } else {
    if (hours === 0) return `${minutes} min`
    if (minutes === 0) return `${hours} hrs`
    return `${hours} hrs ${minutes} min`
  }
}
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}
/**
 * The business timezone's short name ("EST", "CET") when the device is on a
 * different clock, otherwise null.
 *
 * Compared by current wall-clock time rather than by zone NAME on purpose:
 * America/New_York and America/Toronto are different names for the same clock, and
 * labelling times for someone whose phone already agrees would be noise. The label
 * appears only for the employee it would otherwise mislead.
 */
function foreignZoneLabel(tz: string | null | undefined): string | null {
  if (!tz) return null
  try {
    const now = new Date()
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
    // Date as well as time: either side of the dateline two zones can show the same
    // clock on different days, and the date header would then be wrong unlabelled.
    const sameTime =
      now.toLocaleTimeString('en-GB', { ...opts, timeZone: tz }) === now.toLocaleTimeString('en-GB', opts)
    const sameDate =
      now.toLocaleDateString('en-CA', { timeZone: tz }) === now.toLocaleDateString('en-CA')
    if (sameTime && sameDate) return null
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(now)
    return parts.find(p => p.type === 'timeZoneName')?.value || tz
  } catch {
    // An unrecognised zone string must not take the page down.
    return null
  }
}

/**
 * A Date standing for the given YYYY-MM-DD, anchored at midday so that week
 * arithmetic can never slip a day across a DST boundary.
 */
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0)
}

function toLocalYMD(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
export default function TimeEntrySimple() {
  const [lang, setLang] = useState<Language>('es')
  const t = translations[lang]

  const navigate = useNavigate()
  const params = useParams<{ token?: string }>()
  const tokenFromUrl = params.token ? decodeURIComponent(params.token) : null

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [clockInTime, setClockInTime] = useState<string | null>(null)
  const [clockOutTime, setClockOutTime] = useState<string | null>(null)
  // Non-null while a break is running. Drives which break button is shown and
  // blocks clocking out until the employee is back.
  const [onBreakSince, setOnBreakSince] = useState<string | null>(null)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [breakBusy, setBreakBusy] = useState(false)

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [viewPeriod, setViewPeriod] = useState<'thisWeek' | 'lastWeek'>('thisWeek')

  function apiBase() {
    return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
  }

  function fetchWithCreds(input: RequestInfo | URL, init: RequestInit = {}) {
    // cache:'no-store' prevents stale session GETs (especially with SW involved)
    return fetch(input, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(init.headers || {}),
        'cache-control': 'no-store',
      },
    })
  }

  useEffect(() => {
    bootstrapEmployee()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (employee) loadTimeEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, viewPeriod])

  async function fetchMe(): Promise<Employee> {
    const base = apiBase()
    const meRes = await fetchWithCreds(`${base}/api/employee-session`, { method: 'GET' })
    const me = await meRes.json().catch(() => ({}))

    if (me?.active !== true || !me?.employee?.id) {
      throw new Error(t.noSession)
    }

    return {
      id: String(me.employee.id),
      name: String(me.employee.name || 'Employee'),
      employee_code: me.employee.employee_code ? String(me.employee.employee_code) : null,
      active: true,
      timezone: me.timezone ? String(me.timezone) : null,
    }
  }

  async function bootstrapEmployee() {
    try {
      setLoading(true)
      setErr(null)

      const base = apiBase()

      // If token in URL: exchange cookie session, THEN immediately read session, THEN clean URL.
      if (tokenFromUrl) {
        const res = await fetchWithCreds(`${base}/api/employee-session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: tokenFromUrl }),
        })

        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || t.employeeNotFound)
        }

        // IMPORTANT: do NOT return here.
        // Immediately fetch session identity while we are still on this load.
        const emp = await fetchMe()
        setEmployee(emp)

        // Clean URL (remove token) without needing a manual reload
        navigate('/time-entry-simple', { replace: true })

        // tz passed explicitly: setEmployee has not landed in state yet.
        await loadTodayEntry(emp.timezone)
        await loadTimeEntries(emp.timezone)
        return
      }

      // No token: just use existing cookie session
      const emp = await fetchMe()
      setEmployee(emp)

      await loadTodayEntry(emp.timezone)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadTodayEntry(tzOverride?: string | null) {
    try {
      const base = apiBase()
      // The business's today, not the device's — an employee an hour the other side
      // of midnight would otherwise be shown, and clock into, the wrong day.
      const today = todayYMD(tzOverride ?? employee?.timezone ?? undefined)

      const res = await fetchWithCreds(`${base}/api/time-entries?from=${today}&to=${today}`)
      if (!res.ok) return

      const data = await res.json().catch(() => [])
      if (Array.isArray(data) && data.length > 0) {
        const entry = data[0]
        setClockInTime(entry.start_time)
        setClockOutTime(entry.end_time)
        setOnBreakSince(entry.on_break_since ?? null)
        setBreakMinutes(toNumberOrNull(entry.break_minutes) || 0)
      } else {
        setClockInTime(null)
        setClockOutTime(null)
        setOnBreakSince(null)
        setBreakMinutes(0)
      }
    } catch (e) {
      console.error('Failed to load today entry:', e)
    }
  }

  async function loadTimeEntries(tzOverride?: string | null) {
    try {
      const base = apiBase()

      // Anchor the week on the business's today, so "this week" does not shift for
      // an employee whose phone is in another timezone.
      const today = ymdToDate(todayYMD(tzOverride ?? employee?.timezone ?? undefined))
      let fromDate: Date
      let toDate: Date

      if (viewPeriod === 'thisWeek') {
        fromDate = getMondayOfWeek(today)
        toDate = new Date(fromDate)
        toDate.setDate(toDate.getDate() + 6)
      } else {
        const lastWeekDate = new Date(today)
        lastWeekDate.setDate(today.getDate() - 7)
        fromDate = getMondayOfWeek(lastWeekDate)
        toDate = new Date(fromDate)
        toDate.setDate(toDate.getDate() + 6)
      }

      const from = toLocalYMD(fromDate)
const to = toLocalYMD(toDate)

      const res = await fetchWithCreds(`${base}/api/time-entries?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed to load time entries')

      const data = await res.json()
      setTimeEntries(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load time entries:', e)
    }
  }

  async function handleClockIn() {
    try {
      const base = apiBase()

      // No time is sent: the server stamps it in the business's timezone. The device
      // clock is not trusted for anything that reaches payroll.
      const res = await fetchWithCreds(`${base}/api/time-entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'clock_in' }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.saveFailed)
      }

      alert(t.clockInSuccess)
      await loadTodayEntry()
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    }
  }

  async function handleClockOut() {
    // The server also closes a dangling break on clock-out, as a safety net for the
    // legacy token path and admin edits. Here we ask the employee to end it instead,
    // so they are never surprised by hours stopping at the start of that break.
    if (onBreakSince) {
      alert(t.endBreakFirst)
      return
    }
    try {
      const base = apiBase()

      const res = await fetchWithCreds(`${base}/api/time-entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'clock_out' }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.saveFailed)
      }

      alert(t.clockOutSuccess)
      await loadTodayEntry()
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    }
  }

  /** Server error codes -> something the employee can act on. */
  function breakErrorMessage(code: string): string {
    switch (code) {
      case 'NOT_CLOCKED_IN':      return t.errNotClockedIn
      case 'ALREADY_CLOCKED_OUT': return t.errAlreadyClockedOut
      case 'BREAK_ALREADY_OPEN':  return t.errBreakOpen
      case 'NO_OPEN_BREAK':       return t.errNoOpenBreak
      case 'ENTRY_APPROVED':      return t.errEntryApproved
      default:                    return code || t.saveFailed
    }
  }

  async function handleBreak(action: 'start' | 'end') {
    if (breakBusy) return
    try {
      setBreakBusy(true)
      const base = apiBase()

      const res = await fetchWithCreds(`${base}/api/time-entry-breaks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(breakErrorMessage(data.error))

      // No confirmation popup: the button flips to End Break and the line beneath
      // it reads "On break since HH:MM" as soon as the reload lands, which says the
      // same thing without a dialog to dismiss one-handed on the shop floor.
      await loadTodayEntry()
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    } finally {
      setBreakBusy(false)
    }
  }

  const stats = useMemo(() => {
  const totalHoursNum = timeEntries.reduce((sum, entry) => sum + (toNumberOrNull(entry.total_hours) || 0), 0)
  const totalEarningsNum = timeEntries.reduce((sum, entry) => sum + (toNumberOrNull(entry.salary) || 0), 0)
  const approvedHoursNum = timeEntries.filter(e => e.approved).reduce((sum, entry) => sum + (toNumberOrNull(entry.total_hours) || 0), 0)
  const pendingHoursNum = totalHoursNum - approvedHoursNum

  // Already excluded from total_hours by the database; shown so the deduction is
  // visible rather than looking like missing time.
  const breakMinutesNum = timeEntries.reduce((sum, entry) => sum + (toNumberOrNull(entry.break_minutes) || 0), 0)

  return {
    totalHours: totalHoursNum,
    totalEarnings: totalEarningsNum,
    approvedHours: approvedHoursNum,
    pendingHours: pendingHoursNum,
    breakMinutes: breakMinutesNum,
    daysWorked: timeEntries.filter(e => e.end_time !== null).length,
  }
}, [timeEntries])

  // Only set when the employee's device is on a different clock than the business.
  const zoneLabel = foreignZoneLabel(employee?.timezone)

  if (loading) return <div className="card page-narrow"><p>{t.loading}</p></div>
  if (err) return <div className="card page-narrow"><p style={{ color: 'var(--color-error)' }}>{t.error} {err}</p></div>
  if (!employee) return <div className="card page-narrow"><p>{t.employeeNotFound}</p></div>

  return (
    <div className="card page-narrow">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
  <h3 style={{ margin: 0 }}>{t.timeEntry}</h3>
  <div style={{ display: 'flex', gap: 6 }}>
    {/* Refresh button */}
    <button
  onClick={() => {
    window.location.reload()
  }}
      style={{
        fontSize: 18,
        padding: '4px 8px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 4,
        cursor: 'pointer',
      }}
      title={lang === 'es' ? 'Actualizar' : 'Refresh'}
    >
      🔄
    </button>
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
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 20,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          {t.today} - {formatLongDate(todayYMD(employee.timezone ?? undefined), lang === 'es' ? 'es-ES' : 'en-US')}
        </div>

        {zoneLabel && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            {t.businessTime} ({zoneLabel})
          </div>
        )}

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
              disabled={!clockInTime || !!clockOutTime || !!onBreakSince}
              style={{
                width: '100%',
                height: 60,
                fontSize: 16,
                opacity: !clockInTime || clockOutTime || onBreakSince ? 0.5 : 1,
                cursor: !clockInTime || clockOutTime || onBreakSince ? 'not-allowed' : 'pointer',
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

        {/* Breaks. Only meaningful between clocking in and clocking out, so the
            whole block stays hidden outside a live shift rather than showing a
            disabled button with no explanation. */}
        {clockInTime && !clockOutTime && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => handleBreak(onBreakSince ? 'end' : 'start')}
              disabled={breakBusy}
              style={{
                width: '100%',
                height: 52,
                fontSize: 16,
                fontWeight: 600,
                background: onBreakSince ? '#fbbf24' : 'transparent',
                color: onBreakSince ? '#1f2937' : 'var(--text)',
                border: `1px solid ${onBreakSince ? '#fbbf24' : 'var(--border)'}`,
                borderRadius: 6,
                opacity: breakBusy ? 0.6 : 1,
                cursor: breakBusy ? 'wait' : 'pointer',
              }}
            >
              {onBreakSince ? t.endBreak : t.startBreak}
            </button>

            {onBreakSince && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>
                {t.onBreakSince} {onBreakSince}
              </div>
            )}

            {breakMinutes > 0 && (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                {t.breaks} {formatHoursMinutes(breakMinutes / 60, lang)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t.timeSummary}</h4>
          <div className="seg-row">
            <button
              onClick={() => setViewPeriod('thisWeek')}
              className={viewPeriod === 'thisWeek' ? 'seg-pill seg-pill--sm active' : 'seg-pill seg-pill--sm'}
            >
              {t.thisWeek}
            </button>
            <button
              onClick={() => setViewPeriod('lastWeek')}
              className={viewPeriod === 'lastWeek' ? 'seg-pill seg-pill--sm active' : 'seg-pill seg-pill--sm'}
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
    <span style={{ fontWeight: 600 }}>{formatHoursMinutes(stats.totalHours, lang)}</span>
  </div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span className="helper">{t.approvedHours}</span>
    <span style={{ fontWeight: 600, color: '#22c55e' }}>{formatHoursMinutes(stats.approvedHours, lang)}</span>
  </div>
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span className="helper">{t.pendingHours}</span>
    <span style={{ fontWeight: 600, color: '#fbbf24' }}>{formatHoursMinutes(stats.pendingHours, lang)}</span>
  </div>
  {stats.breakMinutes > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="helper">{t.breaks}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
        −{formatHoursMinutes(stats.breakMinutes / 60, lang)}
      </span>
    </div>
  )}
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span className="helper">{t.totalEarnings}</span>
    <span style={{ fontWeight: 600 }}>{stats.totalEarnings.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
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
              const entryBreakMinutes = toNumberOrNull(entry.break_minutes) || 0
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
  {hours === null ? '—' : formatHoursMinutes(hours, lang)}
  {entryBreakMinutes > 0 && (
    <>
      <span style={{ margin: '0 8px' }}>•</span>
      <span>{t.breaks} −{formatHoursMinutes(entryBreakMinutes / 60, lang)}</span>
    </>
  )}
</div>
                      {salary !== null && (
                        <div style={{ fontSize: 13, color: '#22c55e', marginTop: 4 }}>
                          {salary.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
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



