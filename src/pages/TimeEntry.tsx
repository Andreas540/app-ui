import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { todayYMD, formatLongDate, clockMinutes } from '../lib/time'
import { DateInput } from '../components/DateInput'

type Employee = {
  id: string
  name: string
  employee_code: string | null
  job_title: string | null
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
  /** Unpaid break minutes. Already deducted from total_hours by the database. */
  break_minutes: number | string | null
  salary: number | string | null
  approved: boolean
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Which break options this tenant offers (db/76), as break-config.mjs reports them. */
type BreakOptions = { flexible: boolean; fixed: number[] }

/**
 * One break on a shift. Two shapes (db/78): a break the employee tracked has times,
 * one a manager entered afterwards has only a length.
 */
type BreakRow = {
  id: string
  time_entry_id: string
  work_date: string
  employee_id: string
  break_start: string | null
  break_end: string | null
  duration_minutes: number | null
}

/** A pending change in the form: a break to add, or a stored one to remove. */
type DraftBreak = {
  key: number
  mode: 'add' | 'remove'
  /** 'custom', a fixed length as a string, or — when removing — a stored break's id. */
  option: string
  minutes: string
}

/** The builder always shows one row, so breaks are visible without a click first. */
function freshDraftRows(): DraftBreak[] {
  return [{ key: Date.now(), mode: 'add', option: '', minutes: '' }]
}

/**
 * What a stored break deducts. An open one deducts nothing until it is closed, which
 * is how the database reads it too.
 */
function breakRowMinutes(b: BreakRow): number {
  if (b.duration_minutes !== null) return Number(b.duration_minutes) || 0
  return clockMinutes(b.break_start, b.break_end) ?? 0
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

function formatHoursMinutes(decimalHours: number): string {
  const totalMinutes = Math.round(decimalHours * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hrs`
  return `${hours} hrs ${minutes} min`
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function toLocalYMD(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function TimeEntry() {
  const { t } = useTranslation()
  const employeeToken = getEmployeeTokenFromUrl()
  const employeeMode = !!employeeToken

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
  const [viewPeriod, setViewPeriod] = useState<'thisWeek' | 'lastWeek'>('thisWeek')

  // Break options are a tenant setting, so they are loaded once. Null until then,
  // which keeps the builder from briefly offering options the tenant does not have.
  const [breakOptions, setBreakOptions] = useState<BreakOptions | null>(null)
  // The breaks already stored against the selected employee and date — what the
  // Remove side of the toggle lists, and what the preview starts from.
  const [dayBreaks, setDayBreaks] = useState<BreakRow[]>([])
  const [draftBreaks, setDraftBreaks] = useState<DraftBreak[]>(freshDraftRows)

  // Scroll target for selectEntryForEdit: the top of the form.
  const formRef = useRef<HTMLDivElement>(null)
  // Guards the two per-day loads below against an earlier response landing after a
  // later one and putting the wrong day's shift in the form.
  const dayRequestRef = useRef(0)
  // Set by Clear, consumed by the effect: clearing must not immediately re-load
  // today's stored shift over the blank form.
  const skipDayPrefillRef = useRef(false)

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

  // Entering breaks is an admin correction, so the builder exists in app mode only —
  // an employee records real times from their own page, and the server refuses an
  // entered break from an employee session anyway.
  useEffect(() => {
    if (!employeeMode) loadBreakOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!employeeMode && selectedEmployeeId && workDate) {
      const token = ++dayRequestRef.current
      loadDayBreaks(token)
      // Picking a date behaves like clicking that day in the list below, except
      // after Clear, which has just emptied the form on purpose.
      if (skipDayPrefillRef.current) skipDayPrefillRef.current = false
      else loadDayEntry(token)
    }
    // Any pending row refers to the employee and date it was built for, so switching
    // either one has to clear it rather than apply it somewhere else.
    setDraftBreaks(freshDraftRows())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, workDate])

  async function loadBreakOptions() {
    try {
      const res = await fetch(`${apiBase()}/api/time-entry-breaks?config=1`, {
        headers: headersFor('app'),
      })
      if (!res.ok) throw new Error(String(res.status))
      setBreakOptions(await res.json())
    } catch (e) {
      // The page still saves times without this; it just cannot offer break entry.
      console.error('Failed to load break options:', e)
      setBreakOptions({ flexible: false, fixed: [] })
    }
  }

  function dayQuery() {
    return `employee_id=${encodeURIComponent(selectedEmployeeId)}&from=${encodeURIComponent(workDate)}&to=${encodeURIComponent(workDate)}`
  }

  async function loadDayBreaks(token: number) {
    try {
      const res = await fetch(`${apiBase()}/api/time-entry-breaks?${dayQuery()}`, {
        headers: headersFor('app'),
      })
      if (!res.ok) throw new Error(String(res.status))
      const rows = await res.json()
      if (token !== dayRequestRef.current) return
      setDayBreaks(rows)
    } catch (e) {
      console.error('Failed to load breaks:', e)
      if (token === dayRequestRef.current) setDayBreaks([])
    }
  }

  /**
   * Load the stored shift for the selected employee and date into the form, so
   * picking a date does the same thing as clicking that day in the list below.
   *
   * A date with no entry leaves the fields alone: the form is then being used to
   * create one, and blanking what was typed would be the wrong move.
   */
  async function loadDayEntry(token: number) {
    try {
      const res = await fetch(`${apiBase()}/api/time-entries?${dayQuery()}`, {
        headers: headersFor('app'),
      })
      if (!res.ok) throw new Error(String(res.status))
      const rows: TimeEntry[] = await res.json()
      if (token !== dayRequestRef.current || rows.length === 0) return
      const entry = rows[0]
      setStartTime(entry.start_time || '')
      setEndTime(entry.end_time || '')
      setNotes(entry.notes || '')
    } catch (e) {
      console.error('Failed to load the entry for that date:', e)
    }
  }

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

      const mode = employeeMode ? 'employee' : 'app'
      const qs = employeeMode
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `employee_id=${encodeURIComponent(selectedEmployeeId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

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
      alert(t('timeEntry.employeeMissing'))
      return
    }
    if (!workDate) {
      alert(t('timeEntry.selectDate'))
      return
    }
    if (!startTime || !endTime) {
      alert(t('timeEntry.enterTimes'))
      return
    }

    // A row with a length chosen but an unusable number is a mistake, not an empty
    // row: stop rather than save the shift and silently drop the break.
    if (draftBreaks.some(r => r.mode === 'add' && r.option && draftMinutes(r) <= 0)) {
      alert(t('timeEntry.breakMinutesInvalid'))
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
        throw new Error(errData.error || t('timeEntry.saveFailed'))
      }

      const result = await res.json()

      const breakErrors = await applyDraftBreaks(result.id)
      if (breakErrors.length > 0) {
        // The times are already saved at this point, so this cannot be reported as a
        // plain failure — it says what did not land, and the reload below shows what did.
        alert(t('timeEntry.breakSaveFailed', { error: breakErrors[0] }))
      } else if (result.created) alert(t('timeEntry.entrySaved'))
      else if (result.updated) alert(t('timeEntry.entryUpdated'))

      await loadTimeEntries()
      if (!employeeMode && selectedEmployeeId) await loadDayBreaks(++dayRequestRef.current)
      setDraftBreaks(freshDraftRows())
      setNotes('')

      const nextDay = new Date(workDate)
      nextDay.setDate(nextDay.getDate() + 1)
      setWorkDate(nextDay.toISOString().split('T')[0])
    } catch (e: any) {
      alert(e?.message || t('timeEntry.saveFailed'))
    }
  }

  /**
   * Apply the pending break rows to the entry the save just returned. Removals run
   * first so that removing one break and adding another in the same save cannot
   * interact. Returns the messages of whatever failed: the shift itself is already
   * stored by now, so a break failure is reported alongside it rather than thrown.
   */
  async function applyDraftBreaks(timeEntryId: string): Promise<string[]> {
    if (!breakBuilderAvailable || !timeEntryId) return []
    const base = apiBase()
    const errors: string[] = []

    for (const row of draftBreaks.filter(r => r.mode === 'remove' && r.option)) {
      try {
        const res = await fetch(`${base}/api/time-entry-breaks?id=${encodeURIComponent(row.option)}`, {
          method: 'DELETE',
          headers: headersFor('app'),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          errors.push(j.error || String(res.status))
        }
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    for (const row of draftBreaks.filter(r => r.mode === 'add')) {
      const minutes = draftMinutes(row)
      if (minutes <= 0) continue
      try {
        const res = await fetch(`${base}/api/time-entry-breaks`, {
          method: 'POST',
          headers: { ...headersFor('app'), 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'duration', time_entry_id: timeEntryId, minutes }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          errors.push(j.error || String(res.status))
        }
      } catch (e: unknown) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    return errors
  }

  async function handleDelete(entryId: string) {
    if (!confirm(t('timeEntry.confirmDelete'))) return

    try {
      const base = apiBase()
      const mode = employeeMode ? 'employee' : 'app'

      const res = await fetch(`${base}/api/time-entries?id=${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
        headers: headersFor(mode),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t('timeEntry.deleteFailed'))
      }

      alert(t('timeEntry.entryDeleted'))
      await loadTimeEntries()
    } catch (e: any) {
      alert(e?.message || t('timeEntry.deleteFailed'))
    }
  }

  /**
   * Put a stored entry back into the form and scroll to it. The form is the only
   * editor on this page, so a row in the list has to travel up to it rather than
   * grow its own fields.
   *
   * Changing the date re-runs the effect above, which reloads that day's breaks and
   * clears any pending break row — the pending rows belonged to the previous date.
   */
  function selectEntryForEdit(entry: TimeEntry) {
    setSelectedEmployeeId(entry.employee_id)
    setWorkDate(String(entry.work_date).slice(0, 10))
    setStartTime(entry.start_time || '')
    setEndTime(entry.end_time || '')
    setNotes(entry.notes || '')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleClear() {
    // Only when the date actually changes, since the effect is what consumes this —
    // left set, it would swallow the next real date change instead.
    if (workDate !== todayYMD()) skipDayPrefillRef.current = true
    setWorkDate(todayYMD())
    setStartTime('08:00')
    setEndTime('17:00')
    setNotes('')
    setDraftBreaks(freshDraftRows())
  }

  /**
   * What one pending row is worth in minutes. A row with nothing chosen is worth
   * nothing, which is what lets the builder sit on the form unused: saving a shift
   * with no breaks must not quietly book one.
   */
  function draftMinutes(row: DraftBreak): number {
    if (row.mode === 'remove') {
      const found = dayBreaks.find(b => b.id === row.option)
      return found ? breakRowMinutes(found) : 0
    }
    const n = Number(row.minutes)
    return Number.isInteger(n) && n > 0 && n <= 720 ? n : 0
  }

  function addDraftRow() {
    setDraftBreaks(rows => [...rows, { key: Date.now() + rows.length, mode: 'add', option: '', minutes: '' }])
  }

  function patchDraftRow(key: number, patch: Partial<DraftBreak>) {
    setDraftBreaks(rows => rows.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function dropDraftRow(key: number) {
    setDraftBreaks(rows => rows.filter(r => r.key !== key))
  }

  /** How a stored break reads in the Remove dropdown. */
  function describeBreak(b: BreakRow): string {
    const mins = breakRowMinutes(b)
    if (b.duration_minutes !== null) return `${mins} min (${t('timeEntry.breakEnteredTag')})`
    if (!b.break_end) return `${t('timeEntry.breakRunningTag')} ${b.break_start ?? ''}`
    return `${mins} min (${b.break_start}–${b.break_end})`
  }

  /**
   * Clocked, breaks and worked for the form as it currently stands — stored breaks
   * plus whatever is pending. Clocked is measured from the two times rather than
   * added back from worked, which would report the break as time on the clock on a
   * day where the break outran the shift.
   */
  const breakPreview = useMemo(() => {
    const clocked = clockMinutes(startTime, endTime)
    const stored = dayBreaks.reduce((sum, b) => sum + breakRowMinutes(b), 0)
    const added = draftBreaks
      .filter(r => r.mode === 'add')
      .reduce((sum, r) => sum + draftMinutes(r), 0)
    const removed = draftBreaks
      .filter(r => r.mode === 'remove')
      .reduce((sum, r) => sum + draftMinutes(r), 0)
    const breaks = Math.max(stored + added - removed, 0)
    return {
      clockedMinutes: clocked,
      breakMinutes: breaks,
      workedMinutes: clocked === null ? null : Math.max(clocked - breaks, 0),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime, dayBreaks, draftBreaks])

  const breakBuilderAvailable =
    !employeeMode && !!breakOptions && (breakOptions.flexible || breakOptions.fixed.length > 0)

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

    // Only from days that also contributed hours. A day still in progress has
    // total_hours NULL and must not skew the subtraction.
    const breakMinutesNum = timeEntries.reduce(
      (sum, entry) => sum + (toNumberOrNull(entry.total_hours) === null ? 0 : (toNumberOrNull(entry.break_minutes) || 0)),
      0,
    )

    // Measured from the clock-in and clock-out times, not as worked + breaks:
    // worked is floored at zero, so that sum reports the break length as time on
    // the clock on any day where a break outran the shift.
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
      daysWorked: timeEntries.length,
    }
  }, [timeEntries])

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>

  const CONTROL_H = 44

  const selectedEmployee = employeeMode
    ? employeeMe
    : employees.find(e => e.id === selectedEmployeeId)

  if (!employeeMode && employees.length === 0) {
    return <div className="card"><p>{t('timeEntry.noEmployees')}</p></div>
  }

  return (
    <div className="card page-normal" ref={formRef} style={{ position: 'relative' }}>
      <h3>{t('timeEntry.title')}</h3>

      {!employeeMode && (
        <div style={{ marginTop: 16 }}>
          <label>{t('employee')}</label>
          <select
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value)}
            style={{ height: CONTROL_H, width: '100%' }}
          >
            {employees.map(emp => {
              // Code and role share one parenthesis; whichever is missing is just
              // left out, so an employee with neither shows a bare name.
              const meta = [emp.employee_code, emp.job_title].filter(Boolean).join(' · ')
              return (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{meta ? ` (${meta})` : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}

      {employeeMode && selectedEmployee && (
        <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
          {t('timeEntry.reportingAs')} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{selectedEmployee.name}</span>
          {selectedEmployee.employee_code ? ` (${selectedEmployee.employee_code})` : ''}
        </div>
      )}

      <div className="row row-2col-mobile" style={{ marginTop: 16 }}>
        <div>
          <label>{t('date')}</label>
          <DateInput
            value={workDate}
            onChange={v => setWorkDate(v)}
            style={{ height: CONTROL_H, width: '100%' }}
          />
        </div>
        <div>
          {/* Start and end time are the clock, not the paid total: breaks come off
              this figure, so labelling it "total hours" was wrong as soon as breaks
              existed. */}
          <label>{t('timeEntry.clockedTime')}</label>
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
            {/* Hours and minutes, not 11.63: a decimal reads as a clock time at a
                glance and 0.63 is not 63 minutes. Same helper and the same source as
                every other figure on the page. */}
            {breakPreview.clockedMinutes === null
              ? '—'
              : formatHoursMinutes(breakPreview.clockedMinutes / 60)}
          </div>
        </div>
      </div>

      {/* Same breakdown, in the same order, as the entry rows below and the employee
          page: clocked, what comes off, what is paid. */}
      {breakPreview.clockedMinutes !== null && breakPreview.breakMinutes > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>{t('timeApproval.clocked')} {formatHoursMinutes(breakPreview.clockedMinutes / 60)}</span>
          <span style={{ margin: '0 8px' }}>•</span>
          <span>{t('timeApproval.breaks')} −{formatHoursMinutes(breakPreview.breakMinutes / 60)}</span>
          <span style={{ margin: '0 8px' }}>•</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            {t('timeApproval.worked')} {formatHoursMinutes((breakPreview.workedMinutes ?? 0) / 60)}
          </span>
        </div>
      )}

      <div style={{
        marginTop: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12
      }}>
        <div>
          <label>{t('timeEntry.startTime')}</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="08:00"
            maxLength={5}
            value={startTime}
            onChange={e => {
              const val = e.target.value
              if (val === '') { setStartTime(''); return }
              const digits = val.replace(/\D/g, '')
              if (digits.length === 0) setStartTime('')
              else if (digits.length <= 2) setStartTime(digits)
              else if (digits.length <= 4) setStartTime(digits.slice(0, 2) + ':' + digits.slice(2))
            }}
            onFocus={e => e.target.select()}
            onBlur={e => {
              const digits = e.target.value.replace(/\D/g, '')
              if (digits.length === 4) setStartTime(digits.slice(0, 2) + ':' + digits.slice(2, 4))
              else if (digits.length === 3) setStartTime(digits.slice(0, 2) + ':' + digits.slice(2) + '0')
              else if (digits.length > 0 && digits.length < 3) setStartTime('08:00')
            }}
            style={{ height: CONTROL_H, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label>{t('timeEntry.endTime')}</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="17:00"
            maxLength={5}
            value={endTime}
            onChange={e => {
              const val = e.target.value
              if (val === '') { setEndTime(''); return }
              const digits = val.replace(/\D/g, '')
              if (digits.length === 0) setEndTime('')
              else if (digits.length <= 2) setEndTime(digits)
              else if (digits.length <= 4) setEndTime(digits.slice(0, 2) + ':' + digits.slice(2))
            }}
            onFocus={e => e.target.select()}
            onBlur={e => {
              const digits = e.target.value.replace(/\D/g, '')
              if (digits.length === 4) setEndTime(digits.slice(0, 2) + ':' + digits.slice(2, 4))
              else if (digits.length === 3) setEndTime(digits.slice(0, 2) + ':' + digits.slice(2) + '0')
              else if (digits.length > 0 && digits.length < 3) setEndTime('17:00')
            }}
            style={{ height: CONTROL_H, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {breakBuilderAvailable && (
        <div style={{ marginTop: 16 }}>
          <label>{t('timeEntry.breaksHeading')}</label>

          <div style={{ display: 'grid', gap: 8 }}>
            {draftBreaks.map(row => {
              // A break already chosen for removal on another row is left out, so the
              // same one cannot be counted twice.
              const removable = dayBreaks.filter(
                b => b.id === row.option || !draftBreaks.some(r => r.key !== row.key && r.option === b.id)
              )
              const customSelected = row.mode === 'add' && row.option === 'custom'
              return (
                <div key={row.key} className="break-row">
                  <div className="break-row__head">
                    <div className="seg-bar">
                      {(['add', 'remove'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          className={row.mode === mode ? 'seg seg--sm active' : 'seg seg--sm'}
                          onClick={() => patchDraftRow(row.key, { mode, option: '', minutes: '' })}
                        >
                          {mode === 'add' ? t('timeEntry.breakAdd') : t('timeEntry.breakRemove')}
                        </button>
                      ))}
                    </div>

                    {/* Paired with the add link below, the way New Order pairs
                        "+ Add product" with "– Remove product". Worded "row" rather
                        than "break": the Add/Remove toggle on the left already uses
                        Remove for taking a stored break off the shift. */}
                    {draftBreaks.length > 1 && (
                      <button
                        type="button"
                        className="helper link-btn"
                        onClick={() => dropDraftRow(row.key)}
                      >
                        – {t('timeEntry.breakDropRow')}
                      </button>
                    )}
                  </div>

                  <div className="break-row__fields">
                    <select
                      value={row.option}
                      onChange={e => {
                        const option = e.target.value
                        patchDraftRow(row.key, {
                          option,
                          // A fixed length fills its own minutes; Custom starts empty for
                          // the field next to it.
                          minutes: row.mode === 'add' && option !== 'custom' && option !== '' ? option : '',
                        })
                      }}
                      style={{ height: CONTROL_H }}
                    >
                      {row.mode === 'add' ? (
                        <>
                          <option value="">—</option>
                          {breakOptions!.fixed.map(m => (
                            <option key={m} value={String(m)}>{m} min</option>
                          ))}
                          {/* Only when the tenant allows flexible breaks: that setting is
                              what makes an arbitrary length a legitimate one. */}
                          {breakOptions!.flexible && (
                            <option value="custom">{t('timeEntry.breakCustom')}</option>
                          )}
                        </>
                      ) : removable.length === 0 ? (
                        <option value="">{t('timeEntry.breakNoneOnDay')}</option>
                      ) : (
                        <>
                          <option value="">{t('timeEntry.breakPickExisting')}</option>
                          {removable.map(b => (
                            <option key={b.id} value={b.id}>{describeBreak(b)}</option>
                          ))}
                        </>
                      )}
                    </select>

                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={t('timeEntry.breakMinPlaceholder')}
                      value={row.mode === 'remove' ? String(draftMinutes(row) || '') : row.minutes}
                      disabled={!customSelected}
                      onChange={e =>
                        patchDraftRow(row.key, { minutes: e.target.value.replace(/\D/g, '').slice(0, 3) })
                      }
                      style={{
                        height: CONTROL_H,
                        boxSizing: 'border-box',
                        opacity: customSelected ? 1 : 0.5,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* The same add-a-row link as New Order's "+ Add product". A full-width
              button here sat directly above Save and read as the thing that commits
              the change. */}
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="helper link-btn"
              onClick={addDraftRow}
            >
              + {t('timeEntry.breakAddAnother')}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label>{t('notesOptional')}</label>
        <input
          type="text"
          placeholder={t('timeEntry.notesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          style={{ height: CONTROL_H, width: '100%' }}
        />
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="primary" onClick={handleSave} style={{ height: CONTROL_H, flex: 1 }}>
          {t('timeEntry.saveButton')}
        </button>
        <button onClick={handleClear} style={{ height: CONTROL_H, flex: 1 }}>
          {t('clear')}
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
              {t('timeEntry.timeSummaryFor')} {selectedEmployee.name}
            </h4>
            <div className="seg-row">
              <button
                onClick={() => setViewPeriod('thisWeek')}
                className={viewPeriod === 'thisWeek' ? 'seg-pill seg-pill--sm active' : 'seg-pill seg-pill--sm'}
              >
                {t('timeEntry.thisWeek')}
              </button>
              <button
                onClick={() => setViewPeriod('lastWeek')}
                className={viewPeriod === 'lastWeek' ? 'seg-pill seg-pill--sm active' : 'seg-pill seg-pill--sm'}
              >
                {t('timeEntry.lastWeek')}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.daysWorked')}</span>
              <span style={{ fontWeight: 600 }}>{stats.daysWorked}</span>
            </div>
            {stats.breakMinutes > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="helper">{t('timeEntry.clockedTime')}</span>
                <span style={{ fontWeight: 600 }}>{formatHoursMinutes(stats.clockedHours)}</span>
              </div>
            )}
            {stats.breakMinutes > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="helper">{t('timeEntry.breaks')}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  −{formatHoursMinutes(stats.breakMinutes / 60)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.hoursWorked')}</span>
              <span style={{ fontWeight: 600 }}>{formatHoursMinutes(stats.totalHours)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.approvedHours')}</span>
              <span style={{ fontWeight: 600, color: '#22c55e' }}>{formatHoursMinutes(stats.approvedHours)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.pendingApproval')}</span>
              <span style={{ fontWeight: 600, color: '#fbbf24' }}>{formatHoursMinutes(stats.pendingHours)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.totalEarnings')}</span>
              <span style={{ fontWeight: 600 }}>{stats.totalEarnings.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
            </div>
          </div>
        </div>
      )}

      {timeEntries.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('timeEntry.recentEntries')}</h4>
          <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflow: 'auto' }}>
            {timeEntries.map(entry => {
              const hours = toNumberOrNull(entry.total_hours)
              const entryBreakMinutes = toNumberOrNull(entry.break_minutes) || 0
              const entryClockedMinutes = clockMinutes(entry.start_time, entry.end_time)
              return (
                <div
                  key={entry.id}
                  onClick={() => selectEntryForEdit(entry)}
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
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {formatLongDate(entry.work_date)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {entry.start_time} - {entry.end_time}
                      {/* Same breakdown as the approval rows and the employee page,
                          so one day reads identically wherever it is looked at. All
                          three figures show even at zero breaks: a row that changes
                          shape when a break is removed makes the reader work out
                          which number they are looking at. */}
                      {hours === null ? (
                        <>
                          <span style={{ margin: '0 8px' }}>•</span>
                          —
                        </>
                      ) : (
                        <>
                          <span style={{ margin: '0 8px' }}>•</span>
                          <span>{t('timeApproval.clocked')} {formatHoursMinutes((entryClockedMinutes ?? 0) / 60)}</span>
                          <span style={{ margin: '0 8px' }}>•</span>
                          <span>{t('timeApproval.breaks')} −{formatHoursMinutes(entryBreakMinutes / 60)}</span>
                          <span style={{ margin: '0 8px' }}>•</span>
                          <span style={{ fontWeight: 600 }}>{t('timeApproval.worked')} {formatHoursMinutes(hours)}</span>
                        </>
                      )}
                    </div>
                    {toNumberOrNull(entry.salary) !== null && (
                      <div style={{ fontSize: 13, color: '#22c55e', marginTop: 4 }}>
                        {toNumberOrNull(entry.salary)!.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                      </div>
                    )}
                    {entry.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {entry.notes}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {entry.approved ? (
                      <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>{t('approved')}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>{t('pending')}</span>
                        <button
                          // Without this the row underneath also fires and the form
                          // loads the entry that was just deleted.
                          onClick={e => { e.stopPropagation(); handleDelete(entry.id) }}
                          style={{
                            padding: '4px 8px',
                            fontSize: 12,
                            background: 'transparent',
                            border: '1px solid salmon',
                            borderRadius: 4,
                            color: 'var(--color-error)',
                            cursor: 'pointer',
                          }}
                        >
                          {t('delete')}
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
