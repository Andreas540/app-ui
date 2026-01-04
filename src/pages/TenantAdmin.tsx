// src/pages/TenantAdmin.tsx
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { FeatureId } from '../lib/features'
import { FEATURE_CATEGORIES, getFeaturesByCategory } from '../lib/features'

interface TenantUser {
  id: string
  email: string
  name: string | null
  role: 'tenant_admin' | 'tenant_user'
  features: FeatureId[] | null // null = all tenant features
}

export default function TenantAdmin() {
  const { user } = useAuth()
  const [users, setUsers] = useState<TenantUser[]>([])
  const [tenantFeatures, setTenantFeatures] = useState<FeatureId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Manage user features modal
  const [managingUserId, setManagingUserId] = useState<string | null>(null)
  const [managingUserName, setManagingUserName] = useState('')
  const [managingUserFeatures, setManagingUserFeatures] = useState<FeatureId[]>([])
  const [savingFeatures, setSavingFeatures] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')

      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
      }

      // Load tenant info and users
      const res = await fetch(`${base}/api/tenant-admin?action=getTenantUsers`, { headers })
      
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Tenant admin access required')
        }
        throw new Error('Failed to load tenant data')
      }

      const data = await res.json()
      setUsers(data.users || [])
      setTenantFeatures(data.tenantFeatures || [])

    } catch (e: any) {
      setError(e?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function openManageUserFeatures(targetUser: TenantUser) {
    setManagingUserId(targetUser.id)
    setManagingUserName(targetUser.name || targetUser.email)
    
    // If user has specific features, use those; otherwise use all tenant features
    setManagingUserFeatures(targetUser.features || tenantFeatures)
  }

  async function handleSaveUserFeatures() {
    if (!managingUserId) return
    
    try {
      setSavingFeatures(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')
      
      const res = await fetch(`${base}/api/tenant-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
        },
        body: JSON.stringify({
          action: 'updateUserFeatures',
          userId: managingUserId,
          features: managingUserFeatures
        })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save features')
      }
      
      alert('User permissions updated successfully!')
      setManagingUserId(null)
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to save features')
    } finally {
      setSavingFeatures(false)
    }
  }

  function toggleFeature(featureId: FeatureId) {
    if (managingUserFeatures.includes(featureId)) {
      setManagingUserFeatures(managingUserFeatures.filter(f => f !== featureId))
    } else {
      setManagingUserFeatures([...managingUserFeatures, featureId])
    }
  }

  function selectAllFeatures() {
    setManagingUserFeatures(tenantFeatures)
  }

  function clearAllFeatures() {
    setManagingUserFeatures([])
  }

  if (loading) return <div className="card"><p>Loading...</p></div>
  
  if (error) return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ color: 'salmon' }}>Error</h3>
      <p>{error}</p>
    </div>
  )

  const CONTROL_H = 44

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Tenant Administration</h2>
        <p className="helper" style={{ marginTop: 8 }}>
          Manage user permissions for {user?.tenantName || 'your organization'}
        </p>
        <p className="helper" style={{ marginTop: 4, fontSize: 12 }}>
          Your tenant has access to {tenantFeatures.length} features. 
          You can customize which features each user can access.
        </p>
      </div>

      {/* Users List */}
      <div className="card">
        <h3>Team Members</h3>
        {users.length === 0 ? (
          <p className="helper">No users yet</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{u.email}</div>
                  {u.name && (
                    <div style={{ marginTop: 4 }}>{u.name}</div>
                  )}
                  <div className="helper" style={{ fontSize: 12, marginTop: 4 }}>
                    Role: {u.role === 'tenant_admin' ? 'Admin' : 'User'}
                  </div>
                  <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                    {u.features === null 
                      ? `Access: All ${tenantFeatures.length} tenant features`
                      : `Access: ${u.features.length} of ${tenantFeatures.length} features`
                    }
                  </div>
                </div>
                
                <button
                  onClick={() => openManageUserFeatures(u)}
                  style={{
                    height: 36,
                    padding: '0 16px',
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  Manage Permissions
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manage User Features Modal */}
      {managingUserId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setManagingUserId(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: 600,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Manage Permissions: {managingUserName}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Select which features this user can access. 
              Only features enabled for your tenant are available.
            </p>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={selectAllFeatures}
                style={{ flex: 1, height: 36, fontSize: 13 }}
              >
                Select All
              </button>
              <button
                onClick={clearAllFeatures}
                style={{ flex: 1, height: 36, fontSize: 13 }}
              >
                Clear All
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              {Object.entries(FEATURE_CATEGORIES).map(([categoryKey, categoryName]) => {
                const categoryFeatures = getFeaturesByCategory(categoryKey as keyof typeof FEATURE_CATEGORIES)
                // Only show categories that have at least one tenant-enabled feature
                const availableFeatures = categoryFeatures.filter(f => 
                  tenantFeatures.includes(f.id as FeatureId)
                )
                
                if (availableFeatures.length === 0) return null
                
                return (
                  <div key={categoryKey} style={{ marginBottom: 24 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      fontSize: 14, 
                      marginBottom: 12,
                      color: 'var(--primary)',
                    }}>
                      {categoryName}
                    </div>
                    
                    <div style={{ display: 'grid', gap: 8 }}>
                      {availableFeatures.map((feature) => (
                        <label
                          key={feature.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 12,
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={managingUserFeatures.includes(feature.id as FeatureId)}
                            onChange={() => toggleFeature(feature.id as FeatureId)}
                            style={{ width: 20, height: 20 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{feature.name}</div>
                            <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                              {feature.route}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={handleSaveUserFeatures}
                disabled={savingFeatures}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {savingFeatures ? 'Saving...' : 'Save Permissions'}
              </button>
              <button
                onClick={() => setManagingUserId(null)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}