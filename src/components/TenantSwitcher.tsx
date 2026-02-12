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
        background: 'linear-gradient(135deg, #fff3cd 0%, #ffe8a1 100%)',
        borderBottom: '2px solid #ffc107',
        padding: '12px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12, 
        flexWrap: 'wrap',
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        <div style={{ 
          fontWeight: 600, 
          fontSize: 13, 
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          ⚡ SuperAdmin
        </div>
        
        <div style={{ flex: 1, minWidth: 200, maxWidth: 400 }}>
          <select
            value={activeTenantId || ''}
            onChange={(e) => handleTenantChange(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              fontSize: 14,
              border: '2px solid #ffc107',
              borderRadius: 6,
              background: 'white',
              color: '#333',
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 500,
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
          <div style={{ 
            fontSize: 12, 
            color: '#856404',
            padding: '6px 12px',
            background: 'rgba(255,193,7,0.2)',
            borderRadius: 4,
          }}>
            Viewing: <strong>{selectedTenant.name}</strong>
          </div>
        )}
      </div>
    </div>
  )
}