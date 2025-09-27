import { useState, useEffect } from 'react'

export default function Settings() {
  const [tenantName, setTenantName] = useState('')
  const [tenantLoading, setTenantLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [themeColor, setThemeColor] = useState('#6aa1ff')
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load tenant information from database
  useEffect(() => {
    (async () => {
      try {
        setTenantLoading(true)
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/tenant`, { cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`Failed to load tenant info (status ${res.status})`)
        }
        const data = await res.json()
        setTenantName(data.tenant.name)
      } catch (error) {
        console.error('Failed to load tenant info:', error)
        setTenantName('BLV') // Fallback
      } finally {
        setTenantLoading(false)
      }
    })()
  }, [])

  // Track changes to enable/disable save button
  useEffect(() => {
    // For now, only userName changes trigger the save state
    // Later we can add other fields that should be saved
    setHasChanges(userName.trim() !== '')
  }, [userName])

  const handleSave = async () => {
    if (!hasChanges) return

    setSaving(true)
    try {
      // TODO: API call to save user settings
      // For now, just simulate saving to localStorage
      localStorage.setItem('userSettings', JSON.stringify({
        userName: userName.trim(),
        themeColor
      }))
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setHasChanges(false)
      console.log('Settings saved:', { userName, themeColor })
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

      <p className="helper" style={{marginTop:16}}>
        Tenant name is read from the database. User settings are saved locally and will sync to database in future updates.
      </p>
    </div>
  )
}




