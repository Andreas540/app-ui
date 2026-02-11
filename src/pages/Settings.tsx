import { useState, useEffect } from 'react'
import { getAuthHeaders } from '../lib/api'

// Define available shortcuts with their properties
const AVAILABLE_SHORTCUTS = [
  { id: 'D', label: 'Dashboard', title: 'Dashboard', route: '/' },
  { id: 'O', label: 'New Order', title: 'New Order', route: '/orders/new' },
  { id: 'P', label: 'Payments', title: 'Payments', route: '/payments' },
  { id: 'C', label: 'Customers', title: 'Customers', route: '/customers' },
  { id: 'I', label: 'Inventory', title: 'Inventory', route: '/inventory' }
]

const DEFAULT_SHORTCUTS = ['D', 'O', 'P', 'C']

export default function Settings() {
  const [tenantName, setTenantName] = useState('')
  const [tenantLoading, setTenantLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [themeColor, setThemeColor] = useState('#6aa1ff')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(DEFAULT_SHORTCUTS)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Get available shortcuts based on user role
  const getAvailableShortcuts = () => {
    const userLevel = localStorage.getItem('userLevel')
    
    if (userLevel === 'inventory') {
      // Inventory users only see inventory shortcut
      return [{ id: 'I', label: 'Inventory', title: 'Inventory', route: '/inventory' }]
    } else {
      // Admin sees all shortcuts
      return AVAILABLE_SHORTCUTS
    }
  }

  const availableShortcuts = getAvailableShortcuts()

  // Load tenant information from database
  useEffect(() => {
    (async () => {
      try {
        setTenantLoading(true)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        
        const res = await fetch(`${base}/api/tenant`, { 
          cache: 'no-store',
          headers: getAuthHeaders(),
        })
        
        if (!res.ok) {
          throw new Error(`Failed to load tenant info (status ${res.status})`)
        }
        const data = await res.json()
        setTenantName(data.tenant.name)
      } catch (error) {
        console.error('Failed to load tenant info:', error)
        setTenantName('Unknown') // Fallback
      } finally {
        setTenantLoading(false)
      }
    })()
  }, [])

  // Reload tenant info when active tenant changes
  useEffect(() => {
    const handleTenantChange = () => {
      // Reload tenant information when tenant switches
      (async () => {
        try {
          setTenantLoading(true)
          const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
          
          const res = await fetch(`${base}/api/tenant`, { 
            cache: 'no-store',
            headers: getAuthHeaders(),
          })
          
          if (!res.ok) {
            throw new Error(`Failed to load tenant info (status ${res.status})`)
          }
          const data = await res.json()
          setTenantName(data.tenant.name)
        } catch (error) {
          console.error('Failed to load tenant info:', error)
          setTenantName('Unknown')
        } finally {
          setTenantLoading(false)
        }
      })()
    }

    // Listen for storage changes (tenant switching)
    window.addEventListener('storage', handleTenantChange)
    
    return () => {
      window.removeEventListener('storage', handleTenantChange)
    }
  }, [])

  // Track changes to enable/disable save button
  useEffect(() => {
    // Check if userName or shortcuts have changed from defaults
    const shortcutsChanged = JSON.stringify(selectedShortcuts) !== JSON.stringify(DEFAULT_SHORTCUTS)
    setHasChanges(userName.trim() !== '' || shortcutsChanged)
  }, [userName, selectedShortcuts])

  const toggleShortcut = (shortcutId: string) => {
    setSelectedShortcuts(prev => {
      if (prev.includes(shortcutId)) {
        // Remove shortcut
        return prev.filter(id => id !== shortcutId)
      } else if (prev.length < 5) {
        // Add shortcut (max 5)
        // Maintain the original order: add in correct position
        const newShortcuts = [...prev, shortcutId]
        return AVAILABLE_SHORTCUTS
          .map(s => s.id)
          .filter(id => newShortcuts.includes(id))
      }
      return prev // Can't add more than 5
    })
  }

  const handleSave = async () => {
    if (!hasChanges) return

    setSaving(true)
    try {
      // Save user settings including shortcuts
      const settings = {
        userName: userName.trim(),
        themeColor,
        selectedShortcuts
      }
      
      localStorage.setItem('userSettings', JSON.stringify(settings))
      window.location.reload()

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setHasChanges(false)
      console.log('Settings saved:', settings)
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('Please fill in all password fields')
      return
    }

    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match')
      return
    }

    setChangingPassword(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      const res = await fetch(`${base}/api/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password')
      }

      alert('Password changed successfully!')
      
      // Clear form
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      alert(error.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // Load saved settings on component mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('userSettings')
      if (saved) {
        const settings = JSON.parse(saved)
        setUserName(settings.userName || '')
        setThemeColor(settings.themeColor || '#6aa1ff')
        setSelectedShortcuts(settings.selectedShortcuts || DEFAULT_SHORTCUTS)
      }
    } catch (error) {
      console.error('Failed to load saved settings:', error)
    }
  }, [])

  return (
    <div className="card" style={{maxWidth:680}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>App Settings</h3>
        <button 
          className={hasChanges ? "primary" : ""}
          onClick={handleSave}
          disabled={!hasChanges || saving}
          style={{
            opacity: hasChanges ? 1 : 0.5,
            cursor: hasChanges ? 'pointer' : 'not-allowed'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Two column layout for Tenant name and User */}
      <div className="row row-2col-mobile" style={{marginTop:12}}>
        <div>
          <label>Company</label>
          <input 
            value={tenantLoading ? 'Loading...' : tenantName} 
            disabled
            placeholder="Loading company info..." 
            style={{ 
              backgroundColor: 'transparent',
              border: '1px solid var(--primary)',
              color: '#999',
              cursor: 'not-allowed'
            }}
          />
        </div>
        <div>
          <label>User</label>
          <input 
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            name="display-name"  // 🆕 ADD THIS - unique name attribute
    autoComplete="off"   // 🆕 CHANGE THIS - explicitly disable
    data-lpignore="true" // 🆕 ADD THIS - tells LastPass to ignore
    data-form-type="other" // 🆕 ADD THIS - tells browser this isn't a login form 
          />
        </div>
      </div>

      {/* Theme color in separate row */}
      <div style={{marginTop:16}}>
        <label>Theme color</label>
        <input 
          type="color" 
          value={themeColor}
          onChange={(e) => {
            setThemeColor(e.target.value)
            setHasChanges(true)
          }}
        />
      </div>

      {/* Shortcut button selector */}
      <div style={{marginTop:20}}>
        <label>Quick access buttons ({selectedShortcuts.length}/5 selected)</label>
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 8,
          flexWrap: 'wrap'
        }}>
          {availableShortcuts.map(shortcut => {
            const isSelected = selectedShortcuts.includes(shortcut.id)
            return (
              <button
                key={shortcut.id}
                onClick={() => toggleShortcut(shortcut.id)}
                style={{
                  width: 40,
                  height: 40,
                  border: '1px solid var(--primary)',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--primary)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14
                }}
                title={shortcut.title}
              >
                {shortcut.id}
              </button>
            )
          })}
        </div>
        <div className="helper" style={{marginTop: 4}}>
          Select up to 5 quick access buttons for the top navigation
        </div>
      </div>

      {/* Password Change Section */}
      <div style={{
        marginTop: 32,
        paddingTop: 24,
        borderTop: '1px solid var(--border)'
      }}>
        {/* Hidden username field to help password managers understand this is password CHANGE, not login */}
  <input
    type="text"
    name="username"
    autoComplete="username"
    value={localStorage.getItem('userEmail') || ''}
    readOnly
    tabIndex={-1}
    style={{ 
      position: 'absolute',
      left: '-9999px',
      width: '1px',
      height: '1px'
    }}
    aria-hidden="true"
  />
        <h4 style={{ margin: 0, marginBottom: 16 }}>Change Password</h4>
        
        <div style={{ marginTop: 12 }}>
          <label>Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            autoComplete="current-password"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
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

      <p className="helper" style={{marginTop:16}}>
        Tenant name is read from the database. User settings are saved locally and will sync to database in future updates.
      </p>
    </div>
  )
}
