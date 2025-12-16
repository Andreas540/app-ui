import { useState, useEffect } from 'react'

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
      const token = localStorage.getItem('authToken')
      
      const res = await fetch(`${base}/api/tenant`, { 
        cache: 'no-store',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      window.location.reload() // Add this line

// Simulate API delay
await new Promise(resolve => setTimeout(resolve, 500))
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

      <p className="helper" style={{marginTop:16}}>
        Tenant name is read from the database. User settings are saved locally and will sync to database in future updates.
      </p>
    </div>
  )
}
