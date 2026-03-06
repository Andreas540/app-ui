import { useState, useEffect } from 'react'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// Map each shortcut to its feature ID so we can filter by hasFeature()
const ALL_SHORTCUTS = [
  { id: 'D', label: 'Dashboard',  title: 'Dashboard',  route: '/',           feature: 'dashboard'  },
  { id: 'O', label: 'New Order',  title: 'New Order',  route: '/orders/new', feature: 'orders'     },
  { id: 'P', label: 'Payments',   title: 'Payments',   route: '/payments',   feature: 'payments'   },
  { id: 'C', label: 'Customers',  title: 'Customers',  route: '/customers',  feature: 'customers'  },
  { id: 'I', label: 'Inventory',  title: 'Inventory',  route: '/inventory',  feature: 'inventory'  },
] as const

const DEFAULT_SHORTCUTS = ['D', 'O', 'P', 'C']

export default function Settings() {
  const { hasFeature, user } = useAuth()

  const [tenantName, setTenantName]       = useState('')
  const [tenantLoading, setTenantLoading] = useState(true)
  const [userName, setUserName]           = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(DEFAULT_SHORTCUTS)
  const [hasChanges, setHasChanges]       = useState(false)
  const [saving, setSaving]               = useState(false)

  // Password change state
  const [currentPassword, setCurrentPassword]   = useState('')
  const [newPassword, setNewPassword]           = useState('')
  const [confirmPassword, setConfirmPassword]   = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Shortcuts the current user has feature access to
  const availableShortcuts = ALL_SHORTCUTS.filter(s =>
    user?.role === 'super_admin' || hasFeature(s.feature as any)
  )

  // Shortcuts not yet selected (for dropdown options)
  const unselectedShortcuts = availableShortcuts.filter(s => !selectedShortcuts.includes(s.id))

  // ── Tenant loading ────────────────────────────────────────────────────────

  async function fetchTenant() {
    try {
      setTenantLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res  = await fetch(`${base}/api/tenant`, { cache: 'no-store', headers: getAuthHeaders() })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setTenantName(data.tenant.name)
    } catch (error) {
      console.error('Failed to load tenant info:', error)
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

  // ── Shortcut helpers ──────────────────────────────────────────────────────

  const addShortcut = (shortcutId: string) => {
    if (selectedShortcuts.length >= 4) return
    setSelectedShortcuts(prev => {
      const updated = [...prev, shortcutId]
      return ALL_SHORTCUTS.map(s => s.id).filter(id => updated.includes(id))
    })
  }

  const removeShortcut = (shortcutId: string) => {
    setSelectedShortcuts(prev => prev.filter(id => id !== shortcutId))
  }

  // ── Save / password ───────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    try {
      const settings = { userName: userName.trim(), selectedShortcuts }
      localStorage.setItem('userSettings', JSON.stringify(settings))
      window.location.reload()
      await new Promise(resolve => setTimeout(resolve, 500))
      setHasChanges(false)
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('Please fill in all password fields'); return
    }
    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters'); return
    }
    if (newPassword !== confirmPassword) {
      alert('New passwords do not match'); return
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
      alert('Password changed successfully!')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (error: any) {
      alert(error.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // Load saved settings on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('userSettings')
      if (saved) {
        const settings = JSON.parse(saved)
        setUserName(settings.userName || '')
        setSelectedShortcuts(settings.selectedShortcuts || DEFAULT_SHORTCUTS)
      }
    } catch (error) {
      console.error('Failed to load saved settings:', error)
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card" style={{ maxWidth: 680 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>App Settings</h3>
        <button
          className={hasChanges ? 'primary' : ''}
          onClick={handleSave}
          disabled={!hasChanges || saving}
          style={{ opacity: hasChanges ? 1 : 0.5, cursor: hasChanges ? 'pointer' : 'not-allowed' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Company + User row */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>Company</label>
          <input
            value={tenantLoading ? 'Loading...' : tenantName}
            disabled
            style={{ backgroundColor: 'transparent', border: '1px solid var(--primary)', color: '#999', cursor: 'not-allowed' }}
          />
        </div>
        <div>
          <label>User</label>
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            name="display-name"
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
          />
        </div>
      </div>

      {/* Quick access buttons */}
      <div style={{ marginTop: 20 }}>
        <label>Quick access buttons ({selectedShortcuts.length}/4 selected)</label>

        {/* Dropdown + icons, matching the 2-col grid above */}
        <div className="row row-2col-mobile" style={{ marginTop: 8, alignItems: 'flex-start' }}>

          {/* Left col: dropdown — inherits same width as Company/User inputs */}
          <div>
            <select
              value=""
              onChange={(e) => { if (e.target.value) addShortcut(e.target.value) }}
              disabled={selectedShortcuts.length >= 4 || unselectedShortcuts.length === 0}
              style={{
                width: '100%',
                opacity: selectedShortcuts.length >= 4 || unselectedShortcuts.length === 0 ? 0.5 : 1,
                cursor:  selectedShortcuts.length >= 4 || unselectedShortcuts.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="" disabled>
                {selectedShortcuts.length >= 4
                  ? 'Max 4 reached'
                  : unselectedShortcuts.length === 0
                    ? 'All added'
                    : 'Add shortcut…'}
              </option>
              {unselectedShortcuts.map(shortcut => (
                <option key={shortcut.id} value={shortcut.id}>{shortcut.label}</option>
              ))}
            </select>
            <div className="helper" style={{ marginTop: 4 }}>
              Select up to 4. Click an icon to remove it.
            </div>
          </div>

          {/* Right col: selected icons stacked vertically */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedShortcuts.map(id => {
              const shortcut = ALL_SHORTCUTS.find(s => s.id === id)
              if (!shortcut) return null
              return (
                <button
                  key={id}
                  onClick={() => removeShortcut(id)}
                  title={`Remove ${shortcut.title}`}
                  style={{
                    width: 40,
                    height: 40,
                    border: '1px solid var(--primary)',
                    background: 'var(--primary)',
                    color: '#fff',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {id}
                </button>
              )
            })}
          </div>

        </div>
      </div>

      {/* Password Change Section */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        {/* Hidden username for password managers */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={localStorage.getItem('userEmail') || ''}
          readOnly
          tabIndex={-1}
          style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
          aria-hidden="true"
        />

        <h4 style={{ margin: 0, marginBottom: 16 }}>Change Password</h4>

        <div style={{ marginTop: 12 }}>
          <label>Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password" autoComplete="current-password" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>New Password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password" autoComplete="new-password" />
        </div>

        <button
          className="primary"
          onClick={handleChangePassword}
          disabled={changingPassword}
          style={{ marginTop: 16, width: '100%' }}
        >
          {changingPassword ? 'Changing Password...' : 'Change Password'}
        </button>
      </div>

    </div>
  )
}
