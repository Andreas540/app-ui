// src/components/TenantSwitcher.tsx
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAuthHeaders } from '../lib/api'

interface Tenant {
  id: string
  name: string
}

export default function TenantSwitcher() {
  const { user } = useAuth()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTenantId, setActiveTenantId] = useState<string | null>(
    localStorage.getItem('activeTenantId')
  )

  // Only show for SuperAdmin
  if (user?.role !== 'super_admin') return null

  useEffect(() => {
    loadTenants()
  }, [])

  async function loadTenants() {
    try {
      setLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin?action=listTenants`, {
        headers: getAuthHeaders()
      })
      
      if (!res.ok) throw new Error('Failed to load tenants')
      
      const data = await res.json()
      setTenants(data.tenants || [])
    } catch (e) {
      console.error('Failed to load tenants:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleTenantChange(tenantId: string) {
    if (tenantId === '') {
      // Clear tenant - go back to global SuperAdmin mode
      localStorage.removeItem('activeTenantId')
      setActiveTenantId(null)
    } else {
      // Set tenant - impersonate this tenant
      localStorage.setItem('activeTenantId', tenantId)
      setActiveTenantId(tenantId)
    }
    
    // Reload the page to apply new tenant context
    window.location.reload()
  }

  const selectedTenant = tenants.find(t => t.id === activeTenantId)

  return (
    <div
      style={{
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: 8,
        padding: 12,
        margin: '16px 16px 0 16px',
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12, 
        flexWrap: 'wrap' 
      }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#856404' }}>
          ⚡ SuperAdmin Mode
        </div>
        
        <div style={{ flex: 1, minWidth: 200 }}>
          <select
            value={activeTenantId || ''}
            onChange={(e) => handleTenantChange(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              height: 36,
              padding: '0 12px',
              fontSize: 13,
              border: '1px solid #ffc107',
              borderRadius: 4,
              background: 'white',
              color: '#333',
            }}
          >
            <option value="">🌐 Global View (No Tenant)</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>
                👁️ {t.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTenant && (
          <div style={{ fontSize: 12, color: '#856404' }}>
            Viewing <strong>{selectedTenant.name}</strong>'s data with full admin access
          </div>
        )}
      </div>
    </div>
  )
}