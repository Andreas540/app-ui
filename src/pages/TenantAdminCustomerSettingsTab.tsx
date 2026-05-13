import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

interface CustomerRow {
  id: string
  name: string
  hidden: boolean
}

type CustomerSubTab = 'show-hide'

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminCustomerSettingsTab() {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState<CustomerSubTab>('show-hide')
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  const SUB_TABS: { id: CustomerSubTab; label: string }[] = [
    { id: 'show-hide', label: t('tenantAdmin.customerSettings.showHideTitle') },
  ]

  useEffect(() => {
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getCustomerSettings`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const rows: CustomerRow[] = data.customers ?? []
        setCustomers(rows)
        setHiddenIds(new Set(rows.filter(c => c.hidden).map(c => c.id)))
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? customers.filter(c => c.name.toLowerCase().includes(q)) : customers
  }, [customers, search])

  function toggle(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setDoneMsg('')
  }

  async function save() {
    setSaving(true)
    setDoneMsg('')
    try {
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'setHiddenCustomers', hiddenCustomerIds: [...hiddenIds] }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to save')
      }
      setDoneMsg(t('tenantAdmin.customerSettings.saved'))
    } catch (e: any) {
      alert(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Sub-tab bar — dropdown on mobile, underline tabs on desktop */}
      <div className="booking-subtab-bar" style={{ marginBottom: 24 }}>
        <select
          className="booking-subtab-select"
          value={subTab}
          onChange={e => setSubTab(e.target.value as CustomerSubTab)}
        >
          {SUB_TABS.map(tab => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>
        <div className="booking-subtab-tabs" style={{ gap: 4, borderBottom: '1px solid var(--separator)' }}>
          {SUB_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              style={{
                background: 'none', border: 'none',
                borderBottom: subTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: subTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: subTab === tab.id ? 600 : 400,
                fontSize: 14, padding: '6px 14px 10px', cursor: 'pointer', marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Show / Hide Customers ── */}
      {subTab === 'show-hide' && (
        <div>
          <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('tenantAdmin.customerSettings.showHideDesc')}
          </p>

          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>
          ) : (
            <>
              {doneMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, background: '#f0fdf4',
                  border: '1px solid #86efac', color: '#166534', fontSize: 14, marginBottom: 12,
                }}>
                  {doneMsg}
                </div>
              )}

              <input
                type="search"
                placeholder={t('tenantAdmin.customerSettings.search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ marginBottom: 12 }}
              />

              {customers.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.customerSettings.noCustomers')}</p>
              ) : (
                <>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '24px 1fr',
                      padding: '8px 12px', background: 'var(--line)',
                      borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600,
                    }}>
                      <span />
                      <span>{t('tenantAdmin.customerSettings.customer')}</span>
                    </div>

                    {filtered.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: 14, color: 'var(--muted)' }}>
                        {t('tenantAdmin.customerSettings.noMatch')}
                      </div>
                    ) : filtered.map((c, i) => (
                      <label
                        key={c.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '24px 1fr',
                          padding: '8px 12px', fontSize: 14, cursor: 'pointer',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                          opacity: hiddenIds.has(c.id) ? 0.45 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenIds.has(c.id)}
                          onChange={() => toggle(c.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 1 }}
                        />
                        <span style={{ alignSelf: 'center' }}>{c.name}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    {hiddenIds.size > 0 ? (
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {t('tenantAdmin.customerSettings.hiddenCount', { count: hiddenIds.size })}
                      </span>
                    ) : <span />}
                    <button
                      className="primary"
                      onClick={save}
                      disabled={saving}
                      style={{ height: 36, padding: '0 20px', fontSize: 13 }}
                    >
                      {saving ? t('saving') : t('tenantAdmin.customerSettings.saveChanges')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
