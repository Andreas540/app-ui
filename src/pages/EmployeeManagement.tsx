// src/pages/EmployeeManagement.tsx
import { useEffect, useState } from 'react'
import { getAuthHeaders } from '../lib/api'

type Employee = {
  id: string
  name: string
  email: string | null
  employee_code: string | null
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

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [active, setActive] = useState(true)
  const [notes, setNotes] = useState('')

  // Filter state
  const [showInactive, setShowInactive] = useState(false)

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
      if (!res.ok) throw new Error('Failed to load employees')

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
      throw new Error(j.error || 'Failed to fetch next employee code')
    }
    const j = await res.json()
    return String(j.next_code || '')
  }

  async function handleNew() {
    try {
      setEditingId(null)
      setName('')
      setEmail('')
      setActive(true)
      setNotes('')
      setShowForm(true)

      const nextCode = await fetchNextEmployeeCode()
      setEmployeeCode(nextCode || '')
    } catch (e: any) {
      alert(e?.message || 'Failed to generate employee code')
      setEmployeeCode('')
    }
  }

  function handleEdit(employee: Employee) {
    setEditingId(employee.id)
    setName(employee.name)
    setEmail(employee.email || '')
    setEmployeeCode(employee.employee_code || '')
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
    setActive(true)
    setNotes('')
  }

  async function handleSave() {
    if (!name.trim()) {
      alert('Employee name is required')
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
          active,
          notes: notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Save failed')
      }

      const result = await res.json()
      if (result.created) alert('Employee created successfully!')
      else if (result.updated) alert('Employee updated successfully!')

      handleCancel()
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || 'Save failed')
    }
  }

  async function handleDeactivate(id: string, employeeName: string) {
    if (!confirm(`Deactivate ${employeeName}? Their time entries will be preserved.`)) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id, active: false }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Deactivate failed')
      }
      alert('Employee deactivated')
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || 'Deactivate failed')
    }
  }

  async function handleReactivate(id: string, employeeName: string) {
    if (!confirm(`Reactivate ${employeeName}?`)) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/employees`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ id, active: true }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Reactivate failed')
      }
      alert('Employee reactivated')
      await loadEmployees()
    } catch (e: any) {
      alert(e?.message || 'Reactivate failed')
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
        throw new Error(j.error || 'Failed to create share link')
      }

      const j = await res.json()
      const url = String(j.url || '')
      if (!url) throw new Error('No url returned')

      const msg = `Hi ${emp.name}, here’s your time entry link: ${url}`

      // Mobile share sheet if available
      // (Works on some desktops too, but not reliably)
      if ((navigator as any).share) {
        try {
          await (navigator as any).share({ title: 'Time Entry', text: msg, url })
          return
        } catch {
          // fall through to clipboard
        }
      }

      // Desktop fallback: copy link/message
      const ok = await copyToClipboard(url)
      if (ok) alert('Link copied to clipboard')
      else alert(`Copy this link:\n\n${url}`)
    } catch (e: any) {
      alert(e?.message || 'Failed to share link')
    }
  }

  if (loading) return <div className="card"><p>Loading…</p></div>
  if (err) return <div className="card"><p style={{ color: 'salmon' }}>Error: {err}</p></div>

  const CONTROL_H = 44
  const activeEmployees = employees.filter(e => e.active)
  const inactiveEmployees = employees.filter(e => !e.active)

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Employee Management</h3>
        <button className="primary" onClick={handleNew} style={{ height: CONTROL_H }}>
          + New Employee
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
          <span>Show inactive employees</span>
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
            {editingId ? 'Edit Employee' : 'New Employee'}
          </h4>

          <div className="row row-2col-mobile">
            <div>
              <label>Name *</label>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ height: CONTROL_H }}
                autoFocus
              />
            </div>
            <div>
              <label>Employee Code (auto)</label>
              <input
                type="text"
                placeholder="Auto-generated"
                value={employeeCode}
                readOnly
                style={{ height: CONTROL_H, opacity: 0.8, cursor: 'not-allowed' }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ height: CONTROL_H }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Notes</label>
            <textarea
              placeholder="Optional notes..."
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
              <span>Active</span>
            </label>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="primary" onClick={handleSave} style={{ height: CONTROL_H }}>
              {editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={handleCancel} style={{ height: CONTROL_H }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
          Active Employees ({activeEmployees.length})
        </h4>

        {activeEmployees.length === 0 ? (
          <p className="helper">No active employees. Click "New Employee" to add one.</p>
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
                {/* Row 1: info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {emp.name}
                      {emp.employee_code && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                          {emp.employee_code}
                        </span>
                      )}
                    </div>
                    {emp.email && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.email}</div>}
                    {emp.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{emp.notes}</div>}
                  </div>
                </div>

                {/* Row 2: actions (mobile-friendly) */}
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    onClick={() => handleEdit(emp)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      height: 36,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDeactivate(emp.id, emp.name)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      height: 36,
                      background: 'transparent',
                      border: '1px solid salmon',
                      borderRadius: 4,
                      color: 'salmon',
                      cursor: 'pointer',
                    }}
                  >
                    Deactivate
                  </button>

                  <button
                    onClick={() => handleShareLink(emp)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      height: 36,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Share link
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
            Inactive Employees ({inactiveEmployees.length})
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
                  {emp.name}
                  {emp.employee_code && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {emp.employee_code}
                    </span>
                  )}
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'salmon', fontWeight: 400 }}>(Inactive)</span>
                </div>
                {emp.email && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.email}</div>}

                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    onClick={() => handleReactivate(emp.id, emp.name)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      height: 36,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Reactivate
                  </button>

                  <button
                    onClick={() => handleShareLink(emp)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      height: 36,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Re-share link
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

