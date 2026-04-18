import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { todayYMD, formatLongDate } from '../lib/time'
import { DateInput } from '../components/DateInput'

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
  salary: number | string | null
  approved: boolean
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
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
      if (result.created) alert(t('timeEntry.entrySaved'))
      else if (result.updated) alert(t('timeEntry.entryUpdated'))

      await loadTimeEntries()
      setNotes('')

      const nextDay = new Date(workDate)
      nextDay.setDate(nextDay.getDate() + 1)
      setWorkDate(nextDay.toISOString().split('T')[0])
    } catch (e: any) {
      alert(e?.message || t('timeEntry.saveFailed'))
    }
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
      totalHours: totalHoursNum,
      totalEarnings: totalEarningsNum.toFixed(2),
      approvedHours: approvedHoursNum,
      pendingHours: pendingHoursNum,
      daysWorked: timeEntries.length,
    }
  }, [timeEntries])

  if (loading) return <div className="card"><p>{t('loading')}</p></div>
  if (err) return <div className="card"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>

  const CONTROL_H = 44

  const selectedEmployee = employeeMode
    ? employeeMe
    : employees.find(e => e.id === selectedEmployeeId)

  if (!employeeMode && employees.length === 0) {
    return <div className="card"><p>{t('timeEntry.noEmployees')}</p></div>
  }

  return (
    <div className="card page-normal" style={{ position: 'relative' }}>
      <h3>{t('timeEntry.title')}</h3>

      {!employeeMode && (
        <div style={{ marginTop: 16 }}>
          <label>{t('employee')}</label>
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
          <label>{t('timeEntry.totalHours')} {calculatedHours || '—'}</label>
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
            {calculatedHours || '—'} {t('hrs')}
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
                {t('timeEntry.thisWeek')}
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
                {t('timeEntry.lastWeek')}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.daysWorked')}</span>
              <span style={{ fontWeight: 600 }}>{stats.daysWorked}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="helper">{t('timeEntry.totalHours')}</span>
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
              <span style={{ fontWeight: 600 }}>${stats.totalEarnings}</span>
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
                      {hours === null ? '—' : formatHoursMinutes(hours)}
                    </div>
                    {toNumberOrNull(entry.salary) !== null && (
                      <div style={{ fontSize: 13, color: '#22c55e', marginTop: 4 }}>
                        ${toNumberOrNull(entry.salary)!.toFixed(2)}
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
                          onClick={() => handleDelete(entry.id)}
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
