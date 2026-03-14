import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { type FeatureId } from '../lib/features'
import { ALL_SHORTCUTS, DEFAULT_SHORTCUTS } from '../lib/shortcuts'

export default function Settings() {
  const { t } = useTranslation()
  const { hasFeature, user } = useAuth()

  const [tenantName, setTenantName]       = useState('')
  const [tenantLoading, setTenantLoading] = useState(true)
  const [userName, setUserName]           = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<FeatureId[]>(DEFAULT_SHORTCUTS)
  const [hasChanges, setHasChanges]       = useState(false)
  const [saving, setSaving]               = useState(false)

  const [currentPassword, setCurrentPassword]   = useState('')
  const [newPassword, setNewPassword]           = useState('')
  const [confirmPassword, setConfirmPassword]   = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Shortcuts filtered to what the current user has access to
  const availableShortcuts = ALL_SHORTCUTS.filter(s =>
    user?.role === 'super_admin' || hasFeature(s.id)
  )
  const unselectedShortcuts = availableShortcuts.filter(s => !selectedShortcuts.includes(s.id))

  // ── Tenant ────────────────────────────────────────────────────────────────

  async function fetchTenant() {
    try {
      setTenantLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res  = await fetch(`${base}/api/tenant`, { cache: 'no-store', headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setTenantName(data.tenant.name)
    } catch (err) {
      console.error('Failed to load tenant info:', err)
      setTenantName('Unknown')
    } finally {
      setTenantLoading(false)
    }
  }

  useEffect(() => { fetchTenant() }, [])
  useEffect(() => {
    window.addEventListener('storage', fetchTenant)
    return () => window.removeEventListener('storage', fetchTenant)
  }, [])

  // ── Change tracking ───────────────────────────────────────────────────────

  useEffect(() => {
    const shortcutsChanged = JSON.stringify(selectedShortcuts) !== JSON.stringify(DEFAULT_SHORTCUTS)
    setHasChanges(userName.trim() !== '' || shortcutsChanged)
  }, [userName, selectedShortcuts])

  // ── Shortcuts ─────────────────────────────────────────────────────────────

  const addShortcut = (id: FeatureId) => {
    if (selectedShortcuts.length >= 4) return
    setSelectedShortcuts(prev => {
      const updated = [...prev, id]
      return ALL_SHORTCUTS.map(s => s.id).filter(i => updated.includes(i)) as FeatureId[]
    })
  }

  const removeShortcut = (id: FeatureId) => {
    setSelectedShortcuts(prev => prev.filter(i => i !== id))
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    try {
      localStorage.setItem('userSettings', JSON.stringify({ userName: userName.trim(), selectedShortcuts }))
      window.location.reload()
      await new Promise(r => setTimeout(r, 500))
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert(t('settingsPage.savingFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ── Password ──────────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert(t('settingsPage.fillAllFields')); return
    }
    if (newPassword.length < 8) {
      alert(t('settingsPage.passwordMinLength')); return
    }
    if (newPassword !== confirmPassword) {
      alert(t('settingsPage.passwordMismatch')); return
    }
    setChangingPassword(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res  = await fetch(`${base}/api/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      alert(t('settingsPage.passwordChanged'))
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err: any) {
      alert(err.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // ── Load saved settings on mount ──────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem('userSettings')
      if (saved) {
        const s = JSON.parse(saved)
        setUserName(s.userName || '')
        setSelectedShortcuts(s.selectedShortcuts || DEFAULT_SHORTCUTS)
      }
    } catch (err) {
      console.error('Failed to load saved settings:', err)
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card" style={{ maxWidth: 680 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t('settingsPage.title')}</h3>
        <button
          className={hasChanges ? 'primary' : ''}
          onClick={handleSave}
          disabled={!hasChanges || saving}
          style={{ opacity: hasChanges ? 1 : 0.5, cursor: hasChanges ? 'pointer' : 'not-allowed' }}
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      {/* Company + User */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('settingsPage.company')}</label>
          <input
            value={tenantLoading ? t('loadingDots') : tenantName}
            disabled
            style={{ backgroundColor: 'transparent', border: '1px solid var(--primary)', color: '#999', cursor: 'not-allowed' }}
          />
        </div>
        <div>
          <label>{t('settingsPage.user')}</label>
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder={t('settingsPage.enterName')}
            name="display-name"
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
          />
        </div>
      </div>

      {/* Quick access buttons */}
      <div style={{ marginTop: 20 }}>
        <label>{t('settingsPage.quickAccess', { count: selectedShortcuts.length })}</label>

        <div className="row row-2col-mobile" style={{ marginTop: 8, alignItems: 'flex-start' }}>

          {/* Dropdown */}
          <div>
            <select
              value=""
              onChange={(e) => { if (e.target.value) addShortcut(e.target.value as FeatureId) }}
              disabled={selectedShortcuts.length >= 4 || unselectedShortcuts.length === 0}
              style={{
                width: '100%',
                opacity: selectedShortcuts.length >= 4 || unselectedShortcuts.length === 0 ? 0.5 : 1,
                cursor:  selectedShortcuts.length >= 4 || unselectedShortcuts.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="" disabled>
                {selectedShortcuts.length >= 4
                  ? t('settingsPage.maxReached')
                  : unselectedShortcuts.length === 0
                    ? t('settingsPage.allAdded')
                    : t('settingsPage.addShortcut')}
              </option>
              {unselectedShortcuts.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <div className="helper" style={{ marginTop: 4 }}>
              {t('settingsPage.quickAccessHelp')}
            </div>
          </div>

          {/* Selected icons — horizontal */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
            {selectedShortcuts.map(id => {
              const s = ALL_SHORTCUTS.find(x => x.id === id)
              if (!s) return null
              return (
                <button
                  key={id}
                  onClick={() => removeShortcut(id)}
                  title={t('settingsPage.removeTitle', { label: s.label })}
                  style={{
                    width: 40,
                    height: 40,
                    border: '1px solid var(--primary)',
                    background: 'var(--primary)',
                    color: '#fff',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: s.letter.length > 1 ? 11 : 14,
                    letterSpacing: s.letter.length > 1 ? '-0.5px' : 'normal',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {s.letter}
                </button>
              )
            })}
          </div>

        </div>
      </div>

      {/* Password Change */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <input
          type="text" name="username" autoComplete="username"
          value={localStorage.getItem('userEmail') || ''}
          readOnly tabIndex={-1} aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
        />

        <h4 style={{ margin: 0, marginBottom: 16 }}>{t('settingsPage.changePassword')}</h4>

        <div style={{ marginTop: 12 }}>
          <label>{t('settingsPage.currentPassword')}</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t('settingsPage.currentPasswordPlaceholder')} autoComplete="current-password" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>{t('settingsPage.newPassword')}</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('settingsPage.newPasswordPlaceholder')} autoComplete="new-password" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>{t('settingsPage.confirmNewPassword')}</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('settingsPage.confirmNewPasswordPlaceholder')} autoComplete="new-password" />
        </div>

        <button
          className="primary"
          onClick={handleChangePassword}
          disabled={changingPassword}
          style={{ marginTop: 16, width: '100%' }}
        >
          {changingPassword ? t('settingsPage.changingPassword') : t('settingsPage.changePasswordButton')}
        </button>
      </div>

    </div>
  )
}
