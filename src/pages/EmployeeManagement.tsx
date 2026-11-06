// src/pages/EmployeeManagement.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../contexts/LocaleContext'
import { getAuthHeaders } from '../lib/api'
import { useCurrency } from '../lib/useCurrency'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'

type Employee = {
  id: string
  name: string
  email: string | null
  employee_code: string | null
  job_title: string | null
  hour_salary: number | string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Helper to check if value is actually empty (null, undefined, empty string, or string "null")
function isEmpty(value: any): boolean {
  return value == null || value === undefined || value === '' || value === 'null'
}

// Helper to safely get string value (returns empty string if null/undefined/empty/"null")
function safeString(value: any): string {
  return isEmpty(value) ? '' : String(value)
}

export default function EmployeeManagement() {
  const { t } = useTranslation()
  const { timezone } = useLocale()
  const { fmtMoney } = useCurrency()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [hourSalary, setHourSalary] = useState('')
  // Salary as it stood when the form opened, so we can tell a real change from a
  // field that merely has a value.
  const [originalSalary, setOriginalSalary] = useState('')
  // The tenant's role list. in_use counts how many employees hold each one, which
  // the delete warning needs. Titles are created, renamed and deleted in their own
  // right — none of it waits for the employee to be saved.
  const [jobTitles, setJobTitles] = useState<{ name: string; in_use: number }[]>([])
  const [addingJobTitle, setAddingJobTitle] = useState(false)
  const [editingJobTitle, setEditingJobTitle] = useState(false)
  const [newJobTitleName, setNewJobTitleName] = useState('')
  const [savingJobTitle, setSavingJobTitle] = useState(false)
  const [active, setActive] = useState(true)
  const [notes, setNotes] = useState('')
  
  // Salary history options
  const [salaryOption, setSalaryOption] = useState<'history' | 'next' | 'specific'>('next')
  const [specificDate, setSpecificDate] = useState<string>(todayYMD(timezone))

  // Filter state
  const [showInactive, setShowInactive] = useState(false)

  // Helper to safely format salary
  function formatSalary(salary: number | string | null | undefined): string | null {
    if (isEmpty(salary)) return null
    const num = typeof salary === 'number' ? salary : parseFloat(String(salary))
    return isNaN(num) ? null : num.toFixed(2)
  }

  useEffect(() => {
    loadEmployees()
  }, [showInactive])

  useEffect(() => {
    loadJobTitles()
  }, [])

  async function loadEmployees() {
    try {
      setLoading(true)
      setErr(null)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      let url = `${base}/api/employees`
      if (!showInactive) url += '?active=true'

      const res = await fetch(url, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(t('employees.loadFailed'))

      const data = await res.json()
      setEmployees(data)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadJobTitles() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees?job_titles=true`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      // Tolerate a plain string[] as well as [{name, in_use}]. In dev the app calls
      // the DEPLOYED function, so an un-deployed backend would otherwise return
      // strings and render a dropdown of blank options with no visible error.
      const raw = Array.isArray(data.job_titles) ? data.job_titles : []
      setJobTitles(raw.map((r: any) =>
        typeof r === 'string' ? { name: r, in_use: 0 } : { name: String(r?.name ?? ''), in_use: Number(r?.in_use ?? 0) }
      ).filter((r: { name: string }) => r.name))
    } catch { /* dropdown just falls back to whatever is already on the employee */ }
  }

  async function postJobTitleAction(payload: Record<string, unknown>) {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/employees`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error === 'JOB_TITLE_EXISTS' ? t('employees.roleExists') : (data.error || t('employees.roleSaveFailed')))
    }
    return data
  }

  // Saved straight away, so the role exists whether or not this employee is saved.
  async function handleAddJobTitle() {
    const v = newJobTitleName.trim()
    if (!v || savingJobTitle) return
    try {
      setSavingJobTitle(true)
      await postJobTitleAction({ action: 'createJobTitle', title_name: v })
      await loadJobTitles()
      setJobTitle(v)
      setAddingJobTitle(false)
      setNewJobTitleName('')
    } catch (e: any) {
      alert(e?.message || t('employees.roleSaveFailed'))
    } finally {
      setSavingJobTitle(false)
    }
  }

  // Renaming carries the new value onto every employee holding the old one, so
  // nobody is left pointing at a title that no longer exists.
  async function handleRenameJobTitle() {
    const to = newJobTitleName.trim()
    if (!to || !jobTitle || savingJobTitle) return
    try {
      setSavingJobTitle(true)
      await postJobTitleAction({ action: 'renameJobTitle', old_name: jobTitle, new_name: to })
      await loadJobTitles()
      await loadEmployees()
      setJobTitle(to)
      setEditingJobTitle(false)
      setNewJobTitleName('')
    } catch (e: any) {
      alert(e?.message || t('employees.roleSaveFailed'))
    } finally {
      setSavingJobTitle(false)
    }
  }

  async function handleDeleteJobTitle() {
    if (!jobTitle || savingJobTitle) return
    // Ask the server now rather than trusting the count loaded with the page —
    // someone else may have assigned this role since, and a stale count would
    // silently skip the warning.
    let inUse = 0
    try {
      const usage = await postJobTitleAction({ action: 'jobTitleUsage', title_name: jobTitle })
      inUse = Number(usage?.in_use ?? 0)
    } catch (e: any) {
      alert(e?.message || t('employees.roleSaveFailed'))
      return
    }
    const msg = inUse > 0
      ? t('employees.roleDeleteInUse', { name: jobTitle, n: inUse })
      : t('employees.roleDeleteConfirm', { name: jobTitle })
    if (!confirm(msg)) return
    try {
      setSavingJobTitle(true)
      await postJobTitleAction({ action: 'deleteJobTitle', title_name: jobTitle })
      await loadJobTitles()
      await loadEmployees()
      setJobTitle('')
      setEditingJobTitle(false)
      setNewJobTitleName('')
    } catch (e: any) {
      alert(e?.message || t('employees.roleSaveFailed'))
    } finally {
      setSavingJobTitle(false)
    }
  }

  async function fetchNextEmployeeCode() {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/employees?next_code=true`, { headers: getAuthHeaders() })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || t('employees.codeGenerateFailed'))
    }
    const j = await res.json()
    return String(j.next_code || '')
  }

  async function handleNew() {
    try {
      setEditingId(null)
      setName('')
      setJobTitle('')
      setAddingJobTitle(false)
      setNewJobTitleName('')
      setEmail('')
      setHourSalary('')
      setOriginalSalary('')
      setActive(true)
      setNotes('')
      setSalaryOption('next')
      setSpecificDate(todayYMD(timezone))
      setShowForm(true)

      const nextCode = await fetchNextEmployeeCode()
      setEmployeeCode(nextCode || '')
    } catch (e: any) {
      alert(e?.message || t('employees.codeGenerateFailed'))
      setEmployeeCode('')
    }
  }

  function handleEdit(employee: Employee) {
    setEditingId(employee.id)
    setName(safeString(employee.name))
    setEmail(safeString(employee.email))
    setEmployeeCode(safeString(employee.employee_code))
    setJobTitle(safeString(employee.job_title))
    setAddingJobTitle(false)
    setNewJobTitleName('')
    setHourSalary(safeString(employee.hour_salary))
    setOriginalSalary(safeString(employee.hour_salary))
    setActive(employee.active)
    setNotes(safeString(employee.notes))
    setSalaryOption('next')
    setSpecificDate(todayYMD(timezone))
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setEmail('')
    setEmployeeCode('')
    setHourSalary('')
    setOriginalSalary('')
    setActive(true)
    setNotes('')
    setSalaryOption('next')
    setSpecificDate(todayYMD(timezone))
  }

  async function handleSave() {
  if (!name.trim()) {
    alert(t('employees.nameRequired'))
    return
  }

  const salaryNum = hourSalary.trim() ? parseFloat(hourSalary) : null

  if (salaryOption === 'specific' && !specificDate && editingId && salaryNum !== null) {
    alert(t('employees.selectDate'))
    return
  }

  try {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    
    // Save employee with salary history options
    const res = await fetch(`${base}/api/employees`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        name: name.trim(),
        job_title: jobTitle.trim() || null,
        email: email.trim() || null,
        hour_salary: salaryNum,
        active,
        notes: notes.trim() || null,
        // Include salary history options when editing and salary exists
        ...(editingId && salaryNum !== null ? {
          apply_to_history: salaryOption === 'history',
          effective_date: salaryOption === 'specific' ? specificDate : undefined,
        } : {})
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || t('employees.saveFailed'))
    }

    const result = await res.json()

    // Show appropriate success message
    if (result.created) {
      alert(t('employees.created'))
    } else if (result.updated) {
      // Generic by default. The salary qualifier is only appended when the salary
      // actually changed — the old condition was "has a salary", so editing just the
      // name or role reported a salary update. The backdate/history note is kept,
      // because applying a rate to past hours rewrites historical cost and is worth
      // confirming.
      let message = t('employees.updated')
      const salaryChanged = hourSalary.trim() !== originalSalary.trim()
      if (salaryChanged && salaryNum !== null) {
        if (result.applied_to_history) {
          message += ` (${t('employees.salaryAppliedToHistory')})`
        } else if (salaryOption === 'specific') {
          message += ` (${t('employees.salaryEffectiveFrom', { date: specificDate })})`
        }
      }
      alert(message)
    }

    handleCancel()
    await loadEmployees()
  } catch (e: any) {
    alert(e?.message || t('employees.saveFailed'))
  }
}

  async function handleDeactivate(id: string, employeeName: string) {
    if (!confirm(t('employees.deactivateConfirm', { name: employeeName }))) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id, active: false }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t('employees.deactivateFailed'))
      }
      alert(t('employees.deactivated'))
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || t('employees.deactivateFailed'))
    }
  }

  async function handleReactivate(id: string, employeeName: string) {
    if (!confirm(t('employees.reactivateConfirm', { name: employeeName }))) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id, active: true }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t('employees.reactivateFailed'))
      }
      alert(t('employees.reactivated'))
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || t('employees.reactivateFailed'))
    }
  }

  async function handleShareLink(emp: Employee) {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employee-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ employee_id: emp.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || t('employees.createLinkFailed'))
      }

      const j = await res.json()
      const url = String(j.url || '')
      if (!url) throw new Error(t('employees.noUrlReturned'))

      const msg = t('employees.shareLinkMessage', { name: emp.name, url })

      if ((navigator as any).share) {
        try {
          await (navigator as any).share({ title: t('timeEntry.title'), text: msg })
          return
        } catch {
          // fall through to clipboard
        }
      }

      const ok = await copyToClipboard(url)
      if (ok) alert(t('employees.linkCopied'))
      else alert(t('employees.copyLink', { url }))
    } catch (e: any) {
      alert(e?.message || t('employees.shareFailed'))
    }
  }

  if (loading) return <div className="card page-normal"><p>{t('loading')}</p></div>
  if (err) return <div className="card page-normal"><p style={{ color: 'var(--color-error)' }}>{t('error')}: {err}</p></div>

  const CONTROL_H = 44
  const activeEmployees = employees.filter(e => e.active)
  const inactiveEmployees = employees.filter(e => !e.active)

  return (
    <div className="card page-normal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{t('employees.title')}</h3>
        <button className="primary" onClick={handleNew} style={{ height: CONTROL_H }}>
          + {t('employees.newEmployee')}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('employees.showInactive')}</span>
        </label>
      </div>

      {showForm && (
        <div
          style={{
            marginTop: 24,
            padding: 20,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>
            {editingId ? t('employees.editEmployee') : t('employees.newEmployee')}
          </h4>

          {/* Row 1: Name + Role (50/50) */}
          <div className="row row-2col-mobile">
            <div>
              <label>{t('name')} *</label>
              <input
                type="text"
                placeholder={t('name')}
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ height: CONTROL_H }}
                autoFocus
              />
            </div>
            <div>
              <label>{t('employees.role')}</label>
              {(addingJobTitle || editingJobTitle) ? (
                <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder={t('employees.roleName')}
                    value={newJobTitleName}
                    onChange={e => setNewJobTitleName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); editingJobTitle ? handleRenameJobTitle() : handleAddJobTitle() }
                      if (e.key === 'Escape') { setAddingJobTitle(false); setEditingJobTitle(false); setNewJobTitleName('') }
                    }}
                    style={{ flex: 1, minWidth: 0, height: CONTROL_H }}
                  />
                  <button
                    type="button"
                    disabled={savingJobTitle || !newJobTitleName.trim()}
                    onClick={editingJobTitle ? handleRenameJobTitle : handleAddJobTitle}
                    style={{ height: CONTROL_H, padding: '0 10px', flexShrink: 0 }}
                  >
                    {editingJobTitle ? t('save') : t('add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingJobTitle(false); setEditingJobTitle(false); setNewJobTitleName('') }}
                    style={{ height: CONTROL_H, padding: '0 10px', flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                  <select
                    value={jobTitle}
                    onChange={e => {
                      if (e.target.value === '__new__') { setAddingJobTitle(true); setNewJobTitleName(''); setJobTitle('') }
                      else setJobTitle(e.target.value)
                    }}
                    style={{ height: CONTROL_H, flex: 1, minWidth: 0 }}
                  >
                    <option value="">—</option>
                    <option value="__new__">＋ {t('employees.newRole')}</option>
                    {jobTitles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </select>
                  {/* Native <select> cannot hold buttons, so edit/delete for the
                      selected role sit beside it and only appear once one is chosen. */}
                  {jobTitle && (
                    <>
                      <button
                        type="button"
                        title={t('employees.editRole')}
                        aria-label={t('employees.editRole')}
                        onClick={() => { setEditingJobTitle(true); setNewJobTitleName(jobTitle) }}
                        style={{ height: CONTROL_H, padding: '0 10px', flexShrink: 0 }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title={t('employees.deleteRole')}
                        aria-label={t('employees.deleteRole')}
                        disabled={savingJobTitle}
                        onClick={handleDeleteJobTitle}
                        style={{ height: CONTROL_H, padding: '0 10px', flexShrink: 0 }}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Employee Code + Salary/hour */}
          <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
            <div>
              <label>{t('employees.employeeCode')}</label>
              <input
                type="text"
                placeholder="Auto-generated"
                value={employeeCode}
                readOnly
                style={{ height: CONTROL_H, opacity: 0.8, cursor: 'not-allowed' }}
              />
            </div>
            <div>
              <label>{t('employees.hourSalary')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={hourSalary}
                onChange={e => setHourSalary(e.target.value)}
                style={{ height: CONTROL_H }}
              />
            </div>
          </div>

          {/* Salary options - show only if editing and salary field has value */}
          {editingId && hourSalary.trim() && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                {t('employees.salaryOptions')}
              </label>
              
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="salaryOption"
                    checked={salaryOption === 'history'}
                    onChange={() => setSalaryOption('history')}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 14 }}>{t('employees.salaryApplyToHistory')}</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="salaryOption"
                    checked={salaryOption === 'next'}
                    onChange={() => setSalaryOption('next')}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 14 }}>{t('employees.salaryFromToday')}</span>
                </label>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="salaryOption"
                      checked={salaryOption === 'specific'}
                      onChange={() => setSalaryOption('specific')}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14 }}>{t('employees.salaryFromSpecificDate')}</span>
                  </label>
                  
                  {salaryOption === 'specific' && (
                    <div style={{ marginTop: 8, marginLeft: 28 }}>
                      <DateInput
                        value={specificDate}
                        onChange={v => setSpecificDate(v)}
                        style={{ width: '100%', maxWidth: 200, height: CONTROL_H }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label>{t('email')}</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>{t('notes')}</label>
            <textarea
              placeholder={t('employees.optionalNotes')}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 8, borderRadius: 8 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={e => setActive(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>{t('active')}</span>
            </label>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="primary" onClick={handleSave} style={{ height: CONTROL_H }}>
              {editingId ? t('employees.updateButton') : t('employees.createButton')}
            </button>
            <button onClick={handleCancel} style={{ height: CONTROL_H }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
          {t('employees.activeEmployees')} ({activeEmployees.length})
        </h4>

        {activeEmployees.length === 0 ? (
          <p className="helper">{t('employees.noActiveEmployees')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {activeEmployees.map(emp => (
              <div
                key={emp.id}
                style={{
                  padding: 16,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {safeString(emp.name)}
                      {!isEmpty(emp.employee_code) && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                          {emp.employee_code}
                        </span>
                      )}
                      {!isEmpty(emp.job_title) && <span className="chip">{emp.job_title}</span>}
                      {formatSalary(emp.hour_salary) && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#22c55e', fontWeight: 400 }}>
                          {fmtMoney(Number(emp.hour_salary))}/hr
                        </span>
                      )}
                    </div>
                    {!isEmpty(emp.email) && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.email}</div>}
                    {!isEmpty(emp.notes) && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{emp.notes}</div>}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <button
                    onClick={() => handleEdit(emp)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      height: 32,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {t('edit')}
                  </button>

                  <button
                    onClick={() => handleDeactivate(emp.id, emp.name)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      height: 32,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      color: 'var(--color-error)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('employees.deactivate')}
                  </button>

                  <button
                    onClick={() => handleShareLink(emp)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      height: 32,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {t('employees.shareLink')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInactive && inactiveEmployees.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('employees.inactiveEmployees')} ({inactiveEmployees.length})
          </h4>

          <div style={{ display: 'grid', gap: 8 }}>
            {inactiveEmployees.map(emp => (
              <div
                key={emp.id}
                style={{
                  padding: 16,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  opacity: 0.6,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {safeString(emp.name)}
                  {!isEmpty(emp.employee_code) && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {emp.employee_code}
                    </span>
                  )}
                  {!isEmpty(emp.job_title) && <span className="chip">{emp.job_title}</span>}
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-error)', fontWeight: 400 }}>{t('employees.inactiveBadge')}</span>
                </div>
                {!isEmpty(emp.email) && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.email}</div>}

                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <button
                    onClick={() => handleReactivate(emp.id, emp.name)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      height: 32,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {t('employees.reactivate')}
                  </button>

                  <button
                    onClick={() => handleShareLink(emp)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      height: 32,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {t('employees.reshareLink')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

