// src/components/TenantSwitcher.tsx
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAuthHeaders } from '../lib/api'

interface Tenant {
  id: string
  name: string
}

interface TenantUser {
  id: string
  name: string
  email: string
  access_level: string
  role: string
}

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

export default function TenantSwitcher() {
  const { user } = useAuth()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [activeTenantId, setActiveTenantId] = useState<string | null>(
    localStorage.getItem('activeTenantId')
  )
  const [activeUserId, setActiveUserId] = useState<string | null>(
    localStorage.getItem('activeUserId')
  )

  if (user?.role !== 'super_admin') return null

  useEffect(() => {
    loadTenants()
  }, [])

  useEffect(() => {
    if (activeTenantId) loadTenantUsers(activeTenantId)
    else setTenantUsers([])
  }, [activeTenantId])

  async function loadTenants() {
    try {
      setLoading(true)
      const res = await fetch(`${BASE}/api/super-admin?action=listTenants`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      setTenants(data.tenants || [])
    } catch (e) {
      console.error('Failed to load tenants:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadTenantUsers(tenantId: string) {
    try {
      setUsersLoading(true)
      const res = await fetch(`${BASE}/api/super-admin?action=listTenantUsers&tenantId=${tenantId}`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      setTenantUsers(data.users || [])
    } catch (e) {
      console.error('Failed to load tenant users:', e)
    } finally {
      setUsersLoading(false)
    }
  }

  function fireVerifyAndReload(tenantId: string | null, userId: string | null) {
    const token = localStorage.getItem('authToken')
    fetch(`${BASE}/api/auth-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantId ? { 'X-Active-Tenant': tenantId } : {}),
        ...(userId ? { 'X-Active-User': userId } : {}),
      },
      body: JSON.stringify({ token }),
    }).then(async res => {
      if (res.ok) {
        const data = await res.json()
        if (data.user) localStorage.setItem('userData', JSON.stringify(data.user))
      }
    }).catch(() => {})

    window.location.reload()
  }

  function handleTenantChange(tenantId: string) {
    // Always clear user selection when switching tenants
    localStorage.removeItem('activeUserId')
    setActiveUserId(null)

    if (tenantId === '') {
      localStorage.removeItem('activeTenantId')
      setActiveTenantId(null)
    } else {
      localStorage.setItem('activeTenantId', tenantId)
      setActiveTenantId(tenantId)
    }

    fireVerifyAndReload(tenantId || null, null)
  }

  function handleUserChange(userId: string) {
    if (userId === '') {
      localStorage.removeItem('activeUserId')
      setActiveUserId(null)
      fireVerifyAndReload(activeTenantId, null)
    } else {
      localStorage.setItem('activeUserId', userId)
      setActiveUserId(userId)
      fireVerifyAndReload(activeTenantId, userId)
    }
  }

  const selectedTenant = tenants.find(t => t.id === activeTenantId)
  const impersonating = user?.impersonatingUser
  const selectedUser = tenantUsers.find(u => u.id === activeUserId) ?? (
    impersonating ? { id: impersonating.id, name: impersonating.name, email: impersonating.email, role: impersonating.role, access_level: '' } : null
  )

  return (
    <div
      className="no-print"
      style={{
        background: 'linear-gradient(135deg, #fff3cd 0%, #ffe8a1 100%)',
        borderBottom: '2px solid #ffc107',
        padding: 12,
        marginBottom: 16,
        borderRadius: 8,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      {/* Row 1: SuperAdmin label + Tenant picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#856404', whiteSpace: 'nowrap' }}>
          SuperAdmin
        </div>

        <div style={{ flex: 1, minWidth: 180, maxWidth: 320 }}>
          <select
            value={activeTenantId || ''}
            onChange={(e) => handleTenantChange(e.target.value)}
            disabled={loading}
            style={selectStyle}
          >
            <option value="">— Global view —</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {activeTenantId && (
          <>
            <div style={{ fontSize: 12, color: '#856404', whiteSpace: 'nowrap' }}>
              User:
            </div>
            <div style={{ flex: 1, minWidth: 160, maxWidth: 280 }}>
              <select
                value={activeUserId || ''}
                onChange={(e) => handleUserChange(e.target.value)}
                disabled={usersLoading}
                style={selectStyle}
              >
                <option value="">— Admin view —</option>
                {tenantUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'tenant_admin' ? 'Admin' : 'User'}{u.access_level === 'inventory' ? ', Inventory' : ''})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {(selectedTenant || selectedUser) && (
          <div style={{ fontSize: 12, color: '#856404', whiteSpace: 'nowrap' }}>
            {selectedTenant && <span><strong>{selectedTenant.name}</strong></span>}
            {selectedUser && <span> · <strong>{selectedUser.name}</strong></span>}
          </div>
        )}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  fontSize: 13,
  border: '2px solid #ffc107',
  borderRadius: 6,
  background: 'white',
  color: '#333',
  fontWeight: 500,
}
