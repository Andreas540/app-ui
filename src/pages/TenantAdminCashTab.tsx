import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

interface CashReporter { id: string; name: string; can_report_cash: boolean }

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminCashTab() {
  const { t } = useTranslation()
  const [users, setUsers]     = useState<CashReporter[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getCashReporters`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: CashReporter[] = data.users ?? []
        setUsers(list)
        setChecked(new Set(list.filter(u => u.can_report_cash).map(u => u.id)))
      })
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'setCashReporters', userIds: [...checked] }),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>

  return (
    <div>
      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {t('tenantAdmin.cash.desc')}
      </p>

      {users.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>{t('tenantAdmin.cash.noUsers')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {users.map(u => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={checked.has(u.id)}
                onChange={() => toggle(u.id)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              {u.name}
            </label>
          ))}
        </div>
      )}

      <button
        className="primary"
        onClick={save}
        disabled={saving || users.length === 0}
        style={{ height: 36, padding: '0 20px', fontSize: 14 }}
      >
        {saved ? t('tenantAdmin.cash.saved') : saving ? t('saving') : t('save')}
      </button>
    </div>
  )
}
