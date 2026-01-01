// src/pages/EmployeeManagement.tsx
import { useEffect, useState } from 'react'
import { getAuthHeaders } from '../lib/api'

type Employee = {
  id: string
  name: string
  email: string | null
  employee_code: string | null
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

type Language = 'es' | 'en'

const translations = {
  en: {
    title: 'Employee Management',
    newEmployee: 'New Employee',
    showInactive: 'Show inactive employees',
    editEmployee: 'Edit Employee',
    name: 'Name',
    employeeCode: 'Employee Code (auto)',
    hourSalary: 'Salary/hour',
    email: 'Email',
    notes: 'Notes',
    optionalNotes: 'Optional notes...',
    active: 'Active',
    create: 'Create',
    update: 'Update',
    cancel: 'Cancel',
    activeEmployees: 'Active Employees',
    noActiveEmployees: 'No active employees. Click "New Employee" to add one.',
    edit: 'Edit',
    deactivate: 'Deactivate',
    shareLink: 'Share link',
    inactiveEmployees: 'Inactive Employees',
    inactive: '(Inactive)',
    reactivate: 'Reactivate',
    reshareLink: 'Re-share link',
    nameRequired: 'Employee name is required',
    created: 'Employee created successfully!',
    updated: 'Employee updated successfully!',
    deactivateConfirm: (name: string) => `Deactivate ${name}? Their time entries will be preserved.`,
    deactivated: 'Employee deactivated',
    reactivateConfirm: (name: string) => `Reactivate ${name}?`,
    reactivated: 'Employee reactivated',
    shareLinkMessage: (name: string, url: string) => `Hi ${name}, here's your time entry link: ${url}`,
    timeEntry: 'Time Entry',
    linkCopied: 'Link copied to clipboard',
    copyLink: (url: string) => `Copy this link:\n\n${url}`,
    shareFailed: 'Failed to share link',
    codeGenerateFailed: 'Failed to generate employee code',
    saveFailed: 'Save failed',
    deactivateFailed: 'Deactivate failed',
    reactivateFailed: 'Reactivate failed',
    createLinkFailed: 'Failed to create share link',
    noUrlReturned: 'No url returned',
    loadFailed: 'Failed to load employees',
    loading: 'Loading…',
    error: 'Error:',
  },
  es: {
    title: 'Gestión de Empleados',
    newEmployee: 'Nuevo Empleado',
    showInactive: 'Mostrar empleados inactivos',
    editEmployee: 'Editar Empleado',
    name: 'Nombre',
    employeeCode: 'Código de Empleado (auto)',
    hourSalary: 'Salario/hora',
    email: 'Correo electrónico',
    notes: 'Notas',
    optionalNotes: 'Notas opcionales...',
    active: 'Activo',
    create: 'Crear',
    update: 'Actualizar',
    cancel: 'Cancelar',
    activeEmployees: 'Empleados Activos',
    noActiveEmployees: 'No hay empleados activos. Haz clic en "Nuevo Empleado" para agregar uno.',
    edit: 'Editar',
    deactivate: 'Desactivar',
    shareLink: 'Compartir enlace',
    inactiveEmployees: 'Empleados Inactivos',
    inactive: '(Inactivo)',
    reactivate: 'Reactivar',
    reshareLink: 'Volver a compartir enlace',
    nameRequired: 'El nombre del empleado es requerido',
    created: '¡Empleado creado exitosamente!',
    updated: '¡Empleado actualizado exitosamente!',
    deactivateConfirm: (name: string) => `¿Desactivar ${name}? Sus entradas de tiempo se conservarán.`,
    deactivated: 'Empleado desactivado',
    reactivateConfirm: (name: string) => `¿Reactivar ${name}?`,
    reactivated: 'Empleado reactivado',
    shareLinkMessage: (name: string, url: string) => `Hola ${name}, aquí está tu enlace de entrada de tiempo: ${url}`,
    timeEntry: 'Entrada de Tiempo',
    linkCopied: 'Enlace copiado al portapapeles',
    copyLink: (url: string) => `Copia este enlace:\n\n${url}`,
    shareFailed: 'Error al compartir enlace',
    codeGenerateFailed: 'Error al generar código de empleado',
    saveFailed: 'Error al guardar',
    deactivateFailed: 'Error al desactivar',
    reactivateFailed: 'Error al reactivar',
    createLinkFailed: 'Error al crear enlace para compartir',
    noUrlReturned: 'No se devolvió url',
    loadFailed: 'Error al cargar empleados',
    loading: 'Cargando…',
    error: 'Error:',
  },
}

export default function EmployeeManagement() {
  const [lang, setLang] = useState<Language>('es')
  const t = translations[lang]

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [hourSalary, setHourSalary] = useState('')
  const [active, setActive] = useState(true)
  const [notes, setNotes] = useState('')

  // Filter state
  const [showInactive, setShowInactive] = useState(false)

  // Helper to safely format salary
  function formatSalary(salary: number | string | null | undefined): string | null {
    if (salary == null || salary === undefined || salary === '') return null
    const num = typeof salary === 'number' ? salary : parseFloat(String(salary))
    return isNaN(num) ? null : num.toFixed(2)
  }

  useEffect(() => {
    loadEmployees()
  }, [showInactive])

  async function loadEmployees() {
    try {
      setLoading(true)
      setErr(null)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      let url = `${base}/api/employees`
      if (!showInactive) url += '?active=true'

      const res = await fetch(url, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error(t.loadFailed)

      const data = await res.json()
      setEmployees(data)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchNextEmployeeCode() {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/employees?next_code=true`, { headers: getAuthHeaders() })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || t.codeGenerateFailed)
    }
    const j = await res.json()
    return String(j.next_code || '')
  }

  async function handleNew() {
    try {
      setEditingId(null)
      setName('')
      setEmail('')
      setHourSalary('')
      setActive(true)
      setNotes('')
      setShowForm(true)

      const nextCode = await fetchNextEmployeeCode()
      setEmployeeCode(nextCode || '')
    } catch (e: any) {
      alert(e?.message || t.codeGenerateFailed)
      setEmployeeCode('')
    }
  }

  function handleEdit(employee: Employee) {
    setEditingId(employee.id)
    setName(employee.name || '')
    setEmail(employee.email || '')
    setEmployeeCode(employee.employee_code || '')
    setHourSalary(employee.hour_salary != null && employee.hour_salary !== '' ? String(employee.hour_salary) : '')
    setActive(employee.active)
    setNotes(employee.notes || '')
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setEmail('')
    setEmployeeCode('')
    setHourSalary('')
    setActive(true)
    setNotes('')
  }

  async function handleSave() {
    if (!name.trim()) {
      alert(t.nameRequired)
      return
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          name: name.trim(),
          email: email.trim() || null,
          employee_code: employeeCode.trim() || null,
          hour_salary: hourSalary.trim() ? parseFloat(hourSalary) : null,
          active,
          notes: notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.saveFailed)
      }

      const result = await res.json()
      if (result.created) alert(t.created)
      else if (result.updated) alert(t.updated)

      handleCancel()
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || t.saveFailed)
    }
  }

  async function handleDeactivate(id: string, employeeName: string) {
    if (!confirm(t.deactivateConfirm(employeeName))) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id, active: false }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.deactivateFailed)
      }
      alert(t.deactivated)
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || t.deactivateFailed)
    }
  }

  async function handleReactivate(id: string, employeeName: string) {
    if (!confirm(t.reactivateConfirm(employeeName))) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id, active: true }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || t.reactivateFailed)
      }
      alert(t.reactivated)
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || t.reactivateFailed)
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
        throw new Error(j.error || t.createLinkFailed)
      }

      const j = await res.json()
      const url = String(j.url || '')
      if (!url) throw new Error(t.noUrlReturned)

      const msg = t.shareLinkMessage(emp.name, url)

      if ((navigator as any).share) {
        try {
          await (navigator as any).share({ title: t.timeEntry, text: msg, url })
          return
        } catch {
          // fall through to clipboard
        }
      }

      const ok = await copyToClipboard(url)
      if (ok) alert(t.linkCopied)
      else alert(t.copyLink(url))
    } catch (e: any) {
      alert(e?.message || t.shareFailed)
    }
  }

  if (loading) return <div className="card"><p>{t.loading}</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>{t.error} {err}</p></div>

  const CONTROL_H = 44
  const activeEmployees = employees.filter(e => e.active)
  const inactiveEmployees = employees.filter(e => !e.active)

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{t.title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Language switcher */}
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
          <button className="primary" onClick={handleNew} style={{ height: CONTROL_H }}>
            + {t.newEmployee}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>{t.showInactive}</span>
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
            {editingId ? t.editEmployee : t.newEmployee}
          </h4>

          {/* Row 1: Name (full width) */}
          <div>
            <label>{t.name} *</label>
            <input
              type="text"
              placeholder={t.name}
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ height: CONTROL_H }}
              autoFocus
            />
          </div>

          {/* Row 2: Employee Code + Salary/hour */}
          <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
            <div>
              <label>{t.employeeCode}</label>
              <input
                type="text"
                placeholder="Auto-generated"
                value={employeeCode}
                readOnly
                style={{ height: CONTROL_H, opacity: 0.8, cursor: 'not-allowed' }}
              />
            </div>
            <div>
              <label>{t.hourSalary}</label>
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

          <div style={{ marginTop: 12 }}>
            <label>{t.email}</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>{t.notes}</label>
            <textarea
              placeholder={t.optionalNotes}
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
              <span>{t.active}</span>
            </label>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="primary" onClick={handleSave} style={{ height: CONTROL_H }}>
              {editingId ? t.update : t.create}
            </button>
            <button onClick={handleCancel} style={{ height: CONTROL_H }}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
          {t.activeEmployees} ({activeEmployees.length})
        </h4>

        {activeEmployees.length === 0 ? (
          <p className="helper">{t.noActiveEmployees}</p>
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
                      {emp.name || ''}
                      {emp.employee_code && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                          {emp.employee_code}
                        </span>
                      )}
                      {formatSalary(emp.hour_salary) && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#22c55e', fontWeight: 400 }}>
                          ${formatSalary(emp.hour_salary)}/hr
                        </span>
                      )}
                    </div>
                    {emp.email && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.email}</div>}
                    {emp.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{emp.notes}</div>}
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
                    {t.edit}
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
                      color: 'salmon',
                      cursor: 'pointer',
                    }}
                  >
                    {t.deactivate}
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
                    {t.shareLink}
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
            {t.inactiveEmployees} ({inactiveEmployees.length})
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
                  {emp.name || ''}
                  {emp.employee_code && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {emp.employee_code}
                    </span>
                  )}
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'salmon', fontWeight: 400 }}>{t.inactive}</span>
                </div>
                {emp.email && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.email}</div>}

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
                    {t.reactivate}
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
                    {t.reshareLink}
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

