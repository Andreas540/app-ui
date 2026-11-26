// src/pages/TimeEntrySimple.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { todayYMD, formatLongDate, clockMinutes, formatShiftEnd } from '../lib/time'

type Employee = {
  id: string
  name: string
  employee_code: string | null
  active: boolean
  /** The business's timezone. Decides which day "today" is for an employee whose
   *  phone is set elsewhere. Clock and break TIMES come from the server, not here. */
  timezone: string | null
  /** Which break buttons this business offers. The server re-checks it on every
   *  break, so a page left open from before a change cannot book a break that is
   *  now switched off — it just gets told no. */
  breaks: BreakOptions
}

type BreakOptions = {
  /** Start Break / End Break: the employee's two taps decide the length. */
  flexible: boolean
  /** One-tap break lengths in minutes, e.g. [30]. Booked whole, nothing to
   *  come back from. */
  fixed: number[]
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
  /** When a one-tap break booked earlier runs out. Set only for today, and only
   *  while that window is still open. */
  on_break_until: string | null
  approved: boolean
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** One break of today's shift, as /api/time-entry-breaks returns it. */
type BreakRow = {
  id: string
  /** 'HH:MM' in business time. */
  break_start: string
  /** 'HH:MM', or null while a flexible break is still running. */
  break_end: string | null
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
    clockedTime: 'Clocked time:',
    clocked: 'Clocked',
    breakTime: 'Breaks',
    worked: 'Worked',
    hoursWorked: 'Hours worked:',
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
    confirmReClockIn: 'You are already clocked in at {time}.\n\nClocking in again replaces that time. Any break you took before the new time will stop being deducted.\n\nContinue?',
    clockOutSuccess: 'Clocked out successfully!',
    saveFailed: 'Save failed',
    noSession: 'Session missing. Please open your personal link again.',
    startBreak: 'Start Break',
    endBreak: 'End Break',
    fixedBreak: '{min} min Break',
    onBreakSince: 'On break since',
    registeredBreaks: 'Registered breaks',
    breaks: 'Breaks:',
    businessTime: 'All times shown in business time',
    endBreakFirst: 'End your break before clocking out.',
    errNotClockedIn: 'Clock in first.',
    errAlreadyClockedOut: 'You have already clocked out for today.',
    errBreakOpen: 'A break is already running.',
    errNoOpenBreak: 'No break is running.',
    errBreakInProgress: 'Your break runs until {time}.',
    errBreakOptionOff: 'That break option is not available.',
    errEntryApproved: 'Today is already approved and cannot be changed.',
    errShiftStillOpen: 'Your shift from yesterday is still open. Clock out first.',
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
    clockedTime: 'Tiempo registrado:',
    clocked: 'Registrado',
    breakTime: 'Descansos',
    worked: 'Trabajado',
    hoursWorked: 'Horas trabajadas:',
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
    confirmReClockIn: 'Ya marcaste entrada a las {time}.\n\nVolver a marcar entrada reemplaza esa hora. Cualquier descanso que hayas tomado antes de la nueva hora dejará de restarse.\n\n¿Continuar?',
    clockOutSuccess: '¡Salida registrada exitosamente!',
    saveFailed: 'Error al guardar',
    noSession: 'Falta la sesión. Abre tu enlace personal otra vez.',
    startBreak: 'Iniciar Descanso',
    endBreak: 'Terminar Descanso',
    fixedBreak: 'Descanso de {min} min',
    onBreakSince: 'En descanso desde',
    registeredBreaks: 'Descansos registrados',
    breaks: 'Descansos:',
    businessTime: 'Todas las horas se muestran en la hora del negocio',
    endBreakFirst: 'Termina tu descanso antes de marcar salida.',
    errNotClockedIn: 'Primero marca entrada.',
    errAlreadyClockedOut: 'Ya marcaste salida hoy.',
    errBreakOpen: 'Ya hay un descanso en curso.',
    errNoOpenBreak: 'No hay ningún descanso en curso.',
    errBreakInProgress: 'Tu descanso dura hasta las {time}.',
    errBreakOptionOff: 'Esa opción de descanso no está disponible.',
    errEntryApproved: 'El día de hoy ya está aprobado y no se puede cambiar.',
    errShiftStillOpen: 'Tu turno de ayer sigue abierto. Marca la salida primero.',
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
  // The date the current shift was clocked in on. Normally today; yesterday while a
  // shift runs past midnight (the server decides which — utils/current-shift.mjs).
  const [shiftDate, setShiftDate] = useState<string | null>(null)
  const [clockOutTime, setClockOutTime] = useState<string | null>(null)
  // Non-null while a break is running. Drives which break button is shown and
  // blocks clocking out until the employee is back.
  const [onBreakSince, setOnBreakSince] = useState<string | null>(null)
  // Set while a one-tap break booked earlier is still running. Unlike the flexible
  // kind there is nothing to end, so this only reports the window and keeps a
  // second tap from booking a second deduction.
  const [onBreakUntil, setOnBreakUntil] = useState<string | null>(null)
  const [breakMinutes, setBreakMinutes] = useState(0)
  // Today's break rows, so the page can show WHEN each one was taken and not just
  // the total. A fixed break leaves no other trace on the page: there is no second
  // tap to make, so without this the only evidence of the tap would be a number.
  const [todayBreaks, setTodayBreaks] = useState<BreakRow[]>([])
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
      breaks: {
        // Anything other than an explicit false means the original Start/End
        // break, so a server that has not been deployed yet keeps today's page.
        flexible: me.breaks?.flexible !== false,
        fixed: Array.isArray(me.breaks?.fixed)
          ? me.breaks.fixed.map(Number).filter((m: number) => Number.isFinite(m) && m > 0)
          : [],
      },
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
        await loadTodayEntry()
        await loadTimeEntries(emp.timezone)
        return
      }

      // No token: just use existing cookie session
      const emp = await fetchMe()
      setEmployee(emp)

      await loadTodayEntry()
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadTodayEntry() {
    try {
      const base = apiBase()
      // The business's today, not the device's — an employee an hour the other side
      // of midnight would otherwise be shown, and clock into, the wrong day.
      // "current" rather than today's date: after midnight the shift being worked can
      // be one clocked in yesterday, and only the server knows the business's now.
      const res = await fetchWithCreds(`${base}/api/time-entries?current=true`)
      if (!res.ok) return

      const data = await res.json().catch(() => [])
      if (Array.isArray(data) && data.length > 0) {
        const entry = data[0]
        setShiftDate(String(entry.work_date).slice(0, 10))
        setClockInTime(entry.start_time)
        setClockOutTime(entry.end_time)
        setOnBreakSince(entry.on_break_since ?? null)
        setOnBreakUntil(entry.on_break_until ?? null)
        setBreakMinutes(toNumberOrNull(entry.break_minutes) || 0)
        await loadTodayBreaks(entry.id)
      } else {
        setShiftDate(null)
        setClockInTime(null)
        setClockOutTime(null)
        setOnBreakSince(null)
        setOnBreakUntil(null)
        setBreakMinutes(0)
        setTodayBreaks([])
      }
    } catch (e) {
      console.error('Failed to load today entry:', e)
    }
  }

  /**
   * The individual breaks behind today's total. Its own request rather than another
   * field on the entry: the endpoint already exists for exactly this and already
   * scopes an employee to their own rows, so there was nothing to add server-side.
   *
   * Failure is not fatal — the day's total still shows, only the per-break lines
   * go missing.
   */
  async function loadTodayBreaks(timeEntryId: string) {
    try {
      const base = apiBase()
      const res = await fetchWithCreds(`${base}/api/time-entry-breaks?time_entry_id=${encodeURIComponent(timeEntryId)}`)
      if (!res.ok) return
      const rows = await res.json().catch(() => [])
      setTodayBreaks(Array.isArray(rows) ? rows : [])
    } catch (e) {
      console.error('Failed to load today breaks:', e)
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
    // Clocking in again overwrites start_time — there is one row per employee per
    // day and no history of what it was. Worth a confirm, because the realistic way
    // this gets hit is someone back from lunch tapping Clock In instead of End
    // Break, which would silently erase their morning.
    //
    // The new time is not named: the server stamps it in the business timezone, so
    // the page genuinely does not know it yet.
    if (clockInTime && !clockOutTime) {
      if (!window.confirm(t.confirmReClockIn.replace('{time}', clockInTime))) return
    }
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
        throw new Error(errData.error === 'SHIFT_STILL_OPEN' ? t.errShiftStillOpen : (errData.error || t.saveFailed))
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
  function breakErrorMessage(code: string, data?: { break_end?: string }): string {
    switch (code) {
      case 'NOT_CLOCKED_IN':      return t.errNotClockedIn
      case 'ALREADY_CLOCKED_OUT': return t.errAlreadyClockedOut
      case 'BREAK_ALREADY_OPEN':  return t.errBreakOpen
      case 'NO_OPEN_BREAK':       return t.errNoOpenBreak
      // Reachable from a page that was open when the window was booked on another
      // device, so it names the time rather than just refusing.
      case 'BREAK_IN_PROGRESS':   return t.errBreakInProgress.replace('{time}', data?.break_end || '')
      // The tenant switched this option off while this page was open.
      case 'BREAK_OPTION_DISABLED': return t.errBreakOptionOff
      case 'ENTRY_APPROVED':      return t.errEntryApproved
      case 'SHIFT_STILL_OPEN':    return t.errShiftStillOpen
      default:                    return code || t.saveFailed
    }
  }

  /**
   * One request shape for all three: start and end a flexible break, or book a
   * fixed one. A fixed break is sent as minutes and comes back already closed —
   * the server writes both ends of it, so there is no second tap to make.
   */
  async function handleBreak(action: 'start' | 'end' | 'fixed', minutes?: number) {
    if (breakBusy) return
    try {
      setBreakBusy(true)
      const base = apiBase()

      const res = await fetchWithCreds(`${base}/api/time-entry-breaks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'fixed' ? { action, minutes } : { action }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(breakErrorMessage(data.error, data))

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

  // Count breaks ONLY from days that also contributed hours. A day still in
  // progress has total_hours NULL, so its break would otherwise be subtracted from
  // a figure it was never part of.
  const breakMinutesNum = timeEntries.reduce(
    (sum, entry) => sum + (toNumberOrNull(entry.total_hours) === null ? 0 : (toNumberOrNull(entry.break_minutes) || 0)),
    0,
  )

  // What the clock recorded, measured from the times themselves. NOT worked +
  // breaks: worked is floored at zero, so on a day where a registered break was
  // longer than the shift that sum would report the break length as time on the
  // clock. Same set of days as the two figures above — a day with both ends is
  // exactly a day with total_hours.
  const clockedMinutesNum = timeEntries.reduce(
    (sum, entry) => sum + (clockMinutes(entry.start_time, entry.end_time) ?? 0),
    0,
  )

  return {
    clockedHours: clockedMinutesNum / 60,
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

  // What this business offers. Defaults to the original Start/End break so the
  // page behaves as it did if the session response predates break options.
  const breakOptions: BreakOptions = employee?.breaks ?? { flexible: true, fixed: [] }

  // The shift on the card was clocked in yesterday and is still open: someone working
  // through the night. Clock In stays off until they clock out (or the server stops
  // treating it as current, 20 hours after clock-in).
  const shiftPastMidnight =
    !!shiftDate && !!employee && shiftDate !== todayYMD(employee.timezone ?? undefined)

  /**
   * The breaks that are actually being deducted from today, newest last.
   *
   * Filtered by the same rule the database uses — a break counts only if it
   * started at or after the shift's current clock-in — so this list and the
   * deducted total can never tell the employee different things. A break stranded
   * before a re-clock-in stays in the record but stops being shown here, exactly
   * as it stops being subtracted.
   */
  const registeredBreaks = useMemo(() => {
    // Minutes into the shift, so a break after midnight sorts after the evening's.
    const offset = (hhmm: string) => {
      const m = clockMinutes(clockInTime, hhmm)
      return m === null ? 0 : m
    }
    return todayBreaks
      .filter(b => b.break_end !== null)
      // A shift past midnight: a break at 00:30 is "before" a 14:00 clock-in on the
      // clock but inside the shift, and the database counts it (db/79).
      .filter(b => !clockInTime || b.break_start >= clockInTime || shiftPastMidnight)
      .sort((a, b) => offset(a.break_start) - offset(b.break_start))
  }, [todayBreaks, clockInTime, shiftPastMidnight])

  // The day's break total, as the database will settle it at clock-out. Normally
  // that is break_minutes as stored. On a shift past midnight the database cannot
  // yet count a break taken after midnight: with no clock-out it cannot tell 00:30
  // in the night from a break stranded before a re-clock-in (db/79 counts it once
  // the end time exists). The page does know, so it adds those here rather than
  // showing a total that drops them until the employee clocks out.
  const shownBreakMinutes = useMemo(() => {
    if (!shiftPastMidnight || !clockInTime || clockOutTime) return breakMinutes
    const afterMidnight = registeredBreaks
      .filter(b => b.break_start < clockInTime)
      .reduce((sum, b) => sum + (clockMinutes(b.break_start, b.break_end) ?? 0), 0)
    return breakMinutes + afterMidnight
  }, [shiftPastMidnight, clockInTime, clockOutTime, breakMinutes, registeredBreaks])

  // Shared by every break button so they stay one control with one look, however
  // many durations a tenant turns on.
  const breakButtonStyle: React.CSSProperties = {
    width: '100%',
    height: 52,
    fontSize: 16,
    fontWeight: 600,
    background: 'transparent',
    color: 'var(--text)',
    // 2px rather than the usual hairline: on a transparent button this outline is
    // the only thing that says where to tap, and 1px disappeared on the shop
    // floor. box-sizing is border-box globally, so the height above is unchanged.
    border: '2px solid var(--border)',
    borderRadius: 6,
    opacity: breakBusy ? 0.6 : 1,
    cursor: breakBusy ? 'wait' : 'pointer',
  }

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
              disabled={!!clockOutTime || shiftPastMidnight}
              style={{
                width: '100%',
                height: 60,
                fontSize: 16,
                opacity: clockOutTime || shiftPastMidnight ? 0.5 : 1,
                cursor: clockOutTime || shiftPastMidnight ? 'not-allowed' : 'pointer',
              }}
            >
              {t.clockIn}
            </button>
            {clockInTime && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#22c55e', fontWeight: 600 }}>
                {t.clockedInAt} {clockInTime}
                {shiftPastMidnight && shiftDate && (
                  <> ({new Date(`${shiftDate}T12:00:00`).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })})</>
                )}
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
            disabled button with no explanation.

            Which buttons appear is the tenant's setting (Tenant Admin > Employees
            > Breaks). An employee who is mid-break always gets End Break, even if
            the option was switched off while they were away — otherwise their only
            way back would be clocking out, which would end their shift at the
            start of that break. */}
        {clockInTime && !clockOutTime && (onBreakSince || breakOptions.flexible || breakOptions.fixed.length > 0) && (
          <div style={{ marginTop: 16 }}>
            {onBreakSince ? (
              <button
                onClick={() => handleBreak('end')}
                disabled={breakBusy}
                style={{ ...breakButtonStyle, background: '#fbbf24', color: '#1f2937', border: '2px solid #fbbf24' }}
              >
                {t.endBreak}
              </button>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {breakOptions.flexible && (
                  <button
                    onClick={() => handleBreak('start')}
                    disabled={breakBusy || !!onBreakUntil}
                    style={{ ...breakButtonStyle, flex: '1 1 140px', minWidth: 0, opacity: breakBusy || onBreakUntil ? 0.5 : 1 }}
                  >
                    {t.startBreak}
                  </button>
                )}
                {breakOptions.fixed.map(minutes => (
                  <button
                    key={minutes}
                    onClick={() => handleBreak('fixed', minutes)}
                    // Disabled, not hidden, while a booked break is still running.
                    // The server refuses a second one for that half hour anyway,
                    // and a button that vanishes after being tapped leaves the
                    // employee with nothing to read the result under.
                    disabled={breakBusy || !!onBreakUntil}
                    style={{ ...breakButtonStyle, flex: '1 1 140px', minWidth: 0, opacity: breakBusy || onBreakUntil ? 0.5 : 1 }}
                  >
                    {t.fixedBreak.replace('{min}', String(minutes))}
                  </button>
                ))}
              </div>
            )}

            {onBreakSince && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>
                {t.onBreakSince} {onBreakSince}
              </div>
            )}

            {/* What has been booked today, with the times. For a fixed break this
                is the whole receipt: one tap, nothing to come back from, so the
                line below is the only thing that says it happened. The one still
                running is amber, matching the button it has just dimmed. */}
            {registeredBreaks.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="helper" style={{ fontSize: 12, marginBottom: 2 }}>
                  {t.registeredBreaks}
                </div>
                <div style={{ display: 'grid', gap: 2 }}>
                  {registeredBreaks.map(b => {
                    const live = onBreakUntil !== null && b.break_end === onBreakUntil
                    return (
                      <div
                        key={b.id}
                        style={{
                          fontSize: 13,
                          fontWeight: live ? 600 : 400,
                          color: live ? '#fbbf24' : 'var(--text-secondary)',
                        }}
                      >
                        {b.break_start} – {b.break_end}
                        <span style={{ margin: '0 6px' }}>·</span>
                        −{formatHoursMinutes((clockMinutes(b.break_start, b.break_end) ?? 0) / 60, lang)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* The total only earns its line when it is not already said above:
                with exactly one break the line above IS the total. Still shown if
                the per-break fetch failed and left the list empty, so the
                deduction is never invisible. */}
            {shownBreakMinutes > 0 && registeredBreaks.length !== 1 && (
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>
                {t.breaks} −{formatHoursMinutes(shownBreakMinutes / 60, lang)}
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
  {stats.breakMinutes > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="helper">{t.clockedTime}</span>
      <span style={{ fontWeight: 600 }}>{formatHoursMinutes(stats.clockedHours, lang)}</span>
    </div>
  )}
  {stats.breakMinutes > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="helper">{t.breaks}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
        −{formatHoursMinutes(stats.breakMinutes / 60, lang)}
      </span>
    </div>
  )}
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span className="helper">{t.hoursWorked}</span>
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
              const entryClockedMinutes = clockMinutes(entry.start_time, entry.end_time)

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
  {entry.start_time} - {formatShiftEnd(entry.work_date, entry.start_time, entry.end_time, lang === 'es' ? 'es-ES' : 'en-US')}
  {hours !== null && entryBreakMinutes > 0 ? (
    <>
      <span style={{ margin: '0 8px' }}>•</span>
      <span>{t.clocked} {formatHoursMinutes((entryClockedMinutes ?? 0) / 60, lang)}</span>
      <span style={{ margin: '0 8px' }}>•</span>
      <span>{t.breakTime} −{formatHoursMinutes(entryBreakMinutes / 60, lang)}</span>
      <span style={{ margin: '0 8px' }}>•</span>
      <span style={{ fontWeight: 600 }}>{t.worked} {formatHoursMinutes(hours, lang)}</span>
    </>
  ) : (
    <>
      <span style={{ margin: '0 8px' }}>•</span>
      {hours === null ? '—' : formatHoursMinutes(hours, lang)}
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



