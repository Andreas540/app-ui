import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

type EmployeeSubTab = 'time-approval' | 'breaks' | 'other'

type ApprovalSort = 'name' | 'code' | 'salary' | 'role'
const APPROVAL_SORTS: ApprovalSort[] = ['name', 'code', 'salary', 'role']

/**
 * One-tap break lengths this build can offer. The database stores an array of
 * minutes (db/76_break_options.sql), so adding 15 or 60 later is this line plus a
 * translation — no schema or API change.
 */
const FIXED_BREAK_OPTIONS = [30] as const

interface ApprovalUser {
  id: string
  name: string | null
  email: string | null
}

interface EmployeeRow {
  id: string
  name: string
  employee_code: string | null
  job_title: string | null
  active: boolean
  excluded: boolean
}

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminEmployeesTab({ initialSubTab }: { initialSubTab?: EmployeeSubTab }) {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState<EmployeeSubTab>(initialSubTab ?? 'time-approval')

  const SUB_TABS: { id: EmployeeSubTab; label: string }[] = [
    { id: 'time-approval', label: t('tenantAdmin.employees.timeApprovalTitle') },
    { id: 'breaks', label: t('tenantAdmin.employees.breaksTitle') },
    { id: 'other', label: t('tenantAdmin.employees.otherTitle') },
  ]

  const [users, setUsers] = useState<ApprovalUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Excluded ids as currently edited, plus a snapshot of what is stored, so the
  // Save button can be inert until something actually changes.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')

  // Break options offered on the external employee page. Kept in its own state
  // from the approval tab's, so saving one can never be confused with the other.
  const [breakFlexible, setBreakFlexible] = useState(true)
  const [breakFixed, setBreakFixed] = useState<number[]>([])
  const [breaksLoaded, setBreaksLoaded] = useState<{ flexible: boolean; fixed: number[] } | null>(null)
  const [breaksSaving, setBreaksSaving] = useState(false)
  const [breaksDone, setBreaksDone] = useState('')

  // Time Approval's default order (db/80).
  const [sortBy, setSortBy] = useState<ApprovalSort>('name')
  const [sortDesc, setSortDesc] = useState(false)
  const [sortLoaded, setSortLoaded] = useState<{ sort: ApprovalSort; desc: boolean } | null>(null)
  const [sortSaving, setSortSaving] = useState(false)
  const [sortDone, setSortDone] = useState('')
  const sortChanged = !!sortLoaded && (sortLoaded.sort !== sortBy || sortLoaded.desc !== sortDesc)

  useEffect(() => { loadUsers() }, [])
  useEffect(() => { if (subTab === 'other') loadSortSettings() }, [subTab])
  // Re-read each time the tab is opened, so it never shows a stale copy of what
  // another admin saved in the meantime.
  useEffect(() => { if (subTab === 'breaks') loadBreakSettings() }, [subTab])
  useEffect(() => { if (selectedUserId) loadEmployees(selectedUserId) }, [selectedUserId])
  useEffect(() => { setDone('') }, [excludedIds])

  async function loadUsers() {
    try {
      setUsersLoading(true)
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getTimeApprovalUsers`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch { /* leaves the picker empty; nothing is silently saved */ }
    finally { setUsersLoading(false) }
  }

  async function loadEmployees(userId: string) {
    try {
      setEmployeesLoading(true)
      const res = await fetch(
        `${apiBase()}/.netlify/functions/tenant-admin?action=getTimeApprovalExclusions&user_id=${encodeURIComponent(userId)}`,
        { headers: getAuthHeaders() },
      )
      if (!res.ok) return
      const data = await res.json()
      const rows: EmployeeRow[] = Array.isArray(data.employees) ? data.employees : []
      setEmployees(rows)
      const ids = new Set(rows.filter(r => r.excluded).map(r => r.id))
      setExcludedIds(ids)
      setLoadedIds(new Set(ids))
    } catch { /* same */ }
    finally { setEmployeesLoading(false) }
  }

  const breaksChanged = useMemo(() => {
    if (!breaksLoaded) return false
    if (breaksLoaded.flexible !== breakFlexible) return true
    if (breaksLoaded.fixed.length !== breakFixed.length) return true
    return breaksLoaded.fixed.some(m => !breakFixed.includes(m))
  }, [breaksLoaded, breakFlexible, breakFixed])

  async function loadSortSettings() {
    try {
      setSortDone('')
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getTimeApprovalSort`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const sort: ApprovalSort = APPROVAL_SORTS.includes(data.sort) ? data.sort : 'name'
      const desc = data.desc === true
      setSortBy(sort)
      setSortDesc(desc)
      setSortLoaded({ sort, desc })
    } catch { /* leaves the defaults showing; nothing is saved without a click */ }
  }

  async function saveSortSettings() {
    if (!sortChanged) return
    try {
      setSortSaving(true)
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'saveTimeApprovalSort', sort: sortBy, desc: sortDesc }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || t('tenantAdmin.employees.saveFailed'))
      }
      setSortLoaded({ sort: sortBy, desc: sortDesc })
      setSortDone(t('saved'))
    } catch (e) {
      alert(e instanceof Error ? e.message : t('tenantAdmin.employees.saveFailed'))
    } finally {
      setSortSaving(false)
    }
  }

  async function loadBreakSettings() {
    try {
      setBreaksDone('')
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getBreakSettings`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const flexible = data?.breaks?.flexible !== false
      const fixed: number[] = Array.isArray(data?.breaks?.fixed) ? data.breaks.fixed.map(Number) : []
      setBreakFlexible(flexible)
      setBreakFixed(fixed)
      setBreaksLoaded({ flexible, fixed })
    } catch { /* leaves the defaults showing; nothing is saved without a click */ }
  }

  async function saveBreakSettings() {
    if (!breaksChanged) return
    try {
      setBreaksSaving(true)
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'saveBreakSettings', flexible: breakFlexible, fixed: breakFixed }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || t('tenantAdmin.employees.saveFailed'))
      }
      setBreaksLoaded({ flexible: breakFlexible, fixed: [...breakFixed] })
      setBreaksDone(t('saved'))
    } catch (e) {
      alert(e instanceof Error ? e.message : t('tenantAdmin.employees.saveFailed'))
    } finally {
      setBreaksSaving(false)
    }
  }

  function toggleFixed(minutes: number) {
    setBreaksDone('')
    setBreakFixed(prev => (
      prev.includes(minutes) ? prev.filter(m => m !== minutes) : [...prev, minutes].sort((a, b) => a - b)
    ))
  }

  const hasChanges = useMemo(() => (
    excludedIds.size !== loadedIds.size || [...excludedIds].some(id => !loadedIds.has(id))
  ), [excludedIds, loadedIds])

  // Display filter ONLY. excludedIds always holds the full set for this approver,
  // including employees hidden here — the save replaces the whole set, so filtering
  // the saved payload instead would silently drop exclusions for anyone not shown.
  // An employee going inactive therefore never changes their exclusion.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter(e => {
      if (!showInactive && !e.active) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q) || (e.job_title || '').toLowerCase().includes(q)
    })
  }, [employees, search, showInactive])

  // Exclusions that exist but are not on screen, so the count below is never
  // mysterious.
  const hiddenExcluded = useMemo(() => (
    showInactive ? 0 : employees.filter(e => !e.active && excludedIds.has(e.id)).length
  ), [employees, excludedIds, showInactive])

  function toggle(id: string) {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!hasChanges || !selectedUserId) return
    try {
      setSaving(true)
      // POST actions are read from the body here, unlike GET which uses ?action=
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'setTimeApprovalExclusions',
          user_id: selectedUserId,
          employeeIds: [...excludedIds],
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || t('tenantAdmin.employees.saveFailed'))
      }
      setLoadedIds(new Set(excludedIds))
      setDone(t('saved'))
    } catch (e: any) {
      alert(e?.message || t('tenantAdmin.employees.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="booking-subtab-bar" style={{ marginBottom: 24 }}>
        <select
          className="booking-subtab-select"
          value={subTab}
          onChange={e => setSubTab(e.target.value as EmployeeSubTab)}
        >
          {SUB_TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
        <div className="booking-subtab-tabs" style={{ gap: 4, borderBottom: '1px solid var(--separator)' }}>
          {SUB_TABS.map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
              background: 'none', border: 'none',
              borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: subTab === tab.id ? 600 : 400,
              fontSize: 14, padding: '6px 14px 10px', cursor: 'pointer', marginBottom: -1,
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'breaks' && (<>
        <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {t('tenantAdmin.employees.breaksDesc')}
        </p>

        <div style={{ display: 'grid', gap: 2, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={breakFlexible}
              onChange={e => { setBreaksDone(''); setBreakFlexible(e.target.checked) }}
              style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              {t('tenantAdmin.employees.breakFlexible')}
              <span className="helper" style={{ display: 'block', fontSize: 12 }}>
                {t('tenantAdmin.employees.breakFlexibleHint')}
              </span>
            </span>
          </label>

          {FIXED_BREAK_OPTIONS.map(minutes => (
            <label
              key={minutes}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={breakFixed.includes(minutes)}
                onChange={() => toggleFixed(minutes)}
                style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                {t('tenantAdmin.employees.breakFixed', { minutes })}
                <span className="helper" style={{ display: 'block', fontSize: 12 }}>
                  {t('tenantAdmin.employees.breakFixedHint', { minutes })}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* Turning everything off is a legitimate setting — it is how the page
            behaved before breaks existed — but it should not look like a mistake. */}
        {!breakFlexible && breakFixed.length === 0 && (
          <p className="helper" style={{ marginTop: 0, marginBottom: 16 }}>
            {t('tenantAdmin.employees.breaksNoneHint')}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className={breaksChanged ? 'primary' : ''}
            onClick={saveBreakSettings}
            disabled={!breaksChanged || breaksSaving}
            style={{
              height: 36, padding: '0 20px', fontSize: 13,
              opacity: breaksChanged ? 1 : 0.5,
              cursor: breaksChanged ? 'pointer' : 'not-allowed',
            }}
          >
            {breaksSaving ? t('saving') : t('saveChanges')}
          </button>
          {breaksDone && <span style={{ color: 'var(--color-success)', fontSize: 13 }}>{breaksDone}</span>}
        </div>
      </>)}

      {subTab === 'other' && (<>
        <h4 style={{ marginTop: 0, marginBottom: 6 }}>{t('tenantAdmin.employees.approvalSortTitle')}</h4>
        <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {t('tenantAdmin.employees.approvalSortDesc')}
        </p>

        <div style={{ display: 'grid', gap: 12, marginBottom: 16, maxWidth: 360 }}>
          <div>
            <label>{t('tenantAdmin.employees.approvalSortBy')}</label>
            <select
              value={sortBy}
              onChange={e => { setSortDone(''); setSortBy(e.target.value as ApprovalSort) }}
              style={{ width: '100%' }}
            >
              {APPROVAL_SORTS.map(key => (
                <option key={key} value={key}>{t(`timeApproval.sort_${key}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label>{t('tenantAdmin.employees.approvalSortOrder')}</label>
            <div className="seg-bar seg-bar--fill">
              <button
                type="button"
                className={`seg${!sortDesc ? ' active' : ''}`}
                onClick={() => { setSortDone(''); setSortDesc(false) }}
              >
                ↑ {t('timeApproval.sortAscending')}
              </button>
              <button
                type="button"
                className={`seg${sortDesc ? ' active' : ''}`}
                onClick={() => { setSortDone(''); setSortDesc(true) }}
              >
                ↓ {t('timeApproval.sortDescending')}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className={sortChanged ? 'primary' : ''}
            onClick={saveSortSettings}
            disabled={!sortChanged || sortSaving}
            style={{
              height: 36, padding: '0 20px', fontSize: 13,
              opacity: sortChanged ? 1 : 0.5,
              cursor: sortChanged ? 'pointer' : 'not-allowed',
            }}
          >
            {sortSaving ? t('saving') : t('saveChanges')}
          </button>
          {sortDone && <span style={{ color: 'var(--color-success)', fontSize: 13 }}>{sortDone}</span>}
        </div>
      </>)}

      {subTab === 'time-approval' && (<>
        <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {t('tenantAdmin.employees.timeApprovalDesc')}
        </p>

        <label>{t('tenantAdmin.employees.approver')}</label>
        <select
          value={selectedUserId}
          onChange={e => setSelectedUserId(e.target.value)}
          style={{ marginBottom: 16 }}
        >
          <option value="">{usersLoading ? t('loading') : t('tenantAdmin.employees.selectApprover')}</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
          ))}
        </select>

        {!selectedUserId ? (
          <p className="helper">{t('tenantAdmin.employees.selectApproverHint')}</p>
        ) : employeesLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
        ) : employees.length === 0 ? (
          <p className="helper">{t('tenantAdmin.employees.noEmployees')}</p>
        ) : (
          <>
            <input
              type="search"
              placeholder={t('tenantAdmin.employees.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>{t('employees.showInactive')}</span>
            </label>

            <div style={{ display: 'grid', gap: 2, marginBottom: 16 }}>
              {visible.map(emp => (
                <label
                  key={emp.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    // Inactive employees stay listed: their past entries may still
                    // be awaiting approval.
                    opacity: emp.active ? 1 : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={excludedIds.has(emp.id)}
                    onChange={() => toggle(emp.id)}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {emp.name}
                    {emp.employee_code && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{emp.employee_code}</span>
                    )}
                    {emp.job_title && <span className="chip">{emp.job_title}</span>}
                    {!emp.active && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-error)' }}>
                        {t('employees.inactiveBadge')}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className={hasChanges ? 'primary' : ''}
                onClick={save}
                disabled={!hasChanges || saving}
                style={{
                  height: 36, padding: '0 20px', fontSize: 13,
                  opacity: hasChanges ? 1 : 0.5,
                  cursor: hasChanges ? 'pointer' : 'not-allowed',
                }}
              >
                {saving ? t('saving') : t('saveChanges')}
              </button>
              {done && <span style={{ color: 'var(--color-success)', fontSize: 13 }}>{done}</span>}
              <span className="helper" style={{ fontSize: 12 }}>
                {t('tenantAdmin.employees.excludedCount', { n: excludedIds.size, name: selectedUser?.name || '' })}
                {hiddenExcluded > 0 && ` · ${t('tenantAdmin.employees.hiddenInactiveExcluded', { n: hiddenExcluded })}`}
              </span>
            </div>
          </>
        )}
      </>)}
    </div>
  )
}
