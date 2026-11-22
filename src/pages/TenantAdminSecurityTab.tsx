// src/pages/TenantAdminSecurityTab.tsx
//
// Session security for this tenant. PIN Lock still lives under its own tab for
// now and is meant to move here.
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

/** Matches the CHECK constraint in db/77_security_settings.sql. */
const MIN_MINUTES = 5
const MAX_MINUTES = 720

function apiBase() { return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '' }

export default function TenantAdminSecurityTab() {
  const { t } = useTranslation()
  // Re-reads the session config from the server after a save, so the admin's own
  // browser starts using the new period without a reload.
  const { verifyAuth } = useAuth()

  const [minutes, setMinutes] = useState('90')
  const [loaded, setLoaded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      setDone('')
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin?action=getSecuritySettings`, { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const value = String(Number(data?.idleLogoutMinutes) || 90)
      setMinutes(value)
      setLoaded(value)
    } catch { /* leaves the default showing; nothing saves without a click */ }
    finally { setLoading(false) }
  }

  const parsed = Number(minutes)
  const valid = Number.isInteger(parsed) && parsed >= MIN_MINUTES && parsed <= MAX_MINUTES
  const changed = loaded !== null && minutes.trim() !== loaded

  async function save() {
    if (!changed || !valid) return
    try {
      setSaving(true)
      const res = await fetch(`${apiBase()}/.netlify/functions/tenant-admin`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'saveSecuritySettings', idleLogoutMinutes: parsed }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || t('tenantAdmin.security.saveFailed'))
      }
      setLoaded(String(parsed))
      setDone(t('saved'))
      // Everyone else picks it up at their next login; this refreshes the session
      // doing the saving.
      void verifyAuth()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('tenantAdmin.security.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('loading')}</div>

  return (
    <div>
      <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
        {t('tenantAdmin.security.idleLogoutTitle')}
      </h4>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {t('tenantAdmin.security.idleLogoutDesc')}
      </p>

      <div style={{ maxWidth: 320, minWidth: 0 }}>
        <label htmlFor="idle-logout-minutes">{t('tenantAdmin.security.idleLogoutLabel')}</label>
        <input
          id="idle-logout-minutes"
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={minutes}
          onChange={e => { setDone(''); setMinutes(e.target.value) }}
          style={{ width: '100%', minWidth: 0 }}
        />
        <p className="helper" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
          {t('tenantAdmin.security.idleLogoutRange', { min: MIN_MINUTES, max: MAX_MINUTES })}
        </p>
        {!valid && minutes.trim() !== '' && (
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: 'var(--color-error)' }}>
            {t('tenantAdmin.security.idleLogoutInvalid', { min: MIN_MINUTES, max: MAX_MINUTES })}
          </p>
        )}
      </div>

      {/* The ceiling is not editable: it is the backstop for a stolen token, not a
          comfort setting, so it is stated rather than offered. */}
      <p className="helper" style={{ marginTop: 16, marginBottom: 20, fontSize: 12, lineHeight: 1.6 }}>
        {t('tenantAdmin.security.absoluteNote')}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className={changed && valid ? 'primary' : ''}
          onClick={save}
          disabled={!changed || !valid || saving}
          style={{
            height: 36, padding: '0 20px', fontSize: 13,
            opacity: changed && valid ? 1 : 0.5,
            cursor: changed && valid ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? t('saving') : t('saveChanges')}
        </button>
        {done && <span style={{ color: 'var(--color-success)', fontSize: 13 }}>{done}</span>}
      </div>

      <p className="helper" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
        {t('tenantAdmin.security.appliesNote')}
      </p>
    </div>
  )
}
