// src/pages/SuperAdmin.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders } from '../lib/api'
import ManageUserModal from '../components/ManageUserModal'
import type { FeatureId } from '../lib/features'
import { DEFAULT_FEATURES, FEATURE_CATEGORIES, getFeaturesByCategory } from '../lib/features'

interface Tenant {
  id: string
  name: string
  business_type: string
  features?: FeatureId[]
  created_at: string
}

interface TenantIcon {
  id: string
  name: string
  app_icon_192: string | null
  app_icon_512: string | null
  favicon: string | null
}

interface User {
  id: string
  email: string
  name: string | null
  tenants: Array<{
    tenant_id: string
    tenant_name: string
    role: string
  }>
}

interface TenantMembership {
  tenant_id: string
  role: 'tenant_user' | 'tenant_admin'
}

export default function SuperAdmin() {
  const navigate = useNavigate()
  
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Create tenant form
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantBusinessType, setNewTenantBusinessType] = useState('general')
  const [creatingTenant, setCreatingTenant] = useState(false)

  // Icon management state
  const [managingIconsTenantId, setManagingIconsTenantId] = useState<string | null>(null)
  const [managingIconsTenant, setManagingIconsTenant] = useState<TenantIcon | null>(null)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  
  // Create user form
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserMemberships, setNewUserMemberships] = useState<TenantMembership[]>([
    { tenant_id: '', role: 'tenant_user' }
  ])
  const [creatingUser, setCreatingUser] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<'tenants' | 'users'>('tenants')
  const [managingUserId, setManagingUserId] = useState<string | null>(null)
  
  // Tenant features management
  const [managingTenantId, setManagingTenantId] = useState<string | null>(null)
  const [managingTenantName, setManagingTenantName] = useState('')
  const [managingTenantFeatures, setManagingTenantFeatures] = useState<FeatureId[]>([])
  const [savingFeatures, setSavingFeatures] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const headers = getAuthHeaders()

      // Load tenants
      const tenantsRes = await fetch(`${base}/api/super-admin?action=listTenants`, { headers })
      if (!tenantsRes.ok) {
        if (tenantsRes.status === 403) {
          throw new Error('Super admin access required')
        }
        throw new Error('Failed to load tenants')
      }
      const tenantsData = await tenantsRes.json()
      setTenants(tenantsData.tenants || [])

      // Load users
      const usersRes = await fetch(`${base}/api/super-admin?action=listUsers`, { headers })
      if (!usersRes.ok) throw new Error('Failed to load users')
      const usersData = await usersRes.json()
      setUsers(usersData.users || [])

    } catch (e: any) {
      setError(e?.message || 'Failed to load data')
      if (e?.message?.includes('Super admin')) {
        setTimeout(() => navigate('/'), 3000)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateTenant() {
    if (!newTenantName.trim()) {
      alert('Please enter a tenant name')
      return
    }

    try {
      setCreatingTenant(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'createTenant',
          name: newTenantName.trim(),
          businessType: newTenantBusinessType
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create tenant')
      }

      alert('Tenant created successfully!')
      setNewTenantName('')
      setNewTenantBusinessType('general')
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to create tenant')
    } finally {
      setCreatingTenant(false)
    }
  }

  async function handleCreateUser() {
    // Validate
    if (!newUserEmail.trim()) {
      alert('Please enter an email')
      return
    }
    if (newUserPassword.length < 8) {
      alert('Password must be at least 8 characters')
      return
    }
    
    const validMemberships = newUserMemberships.filter(m => m.tenant_id)
    if (validMemberships.length === 0) {
      alert('Please select at least one tenant')
      return
    }

    try {
      setCreatingUser(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'createUser',
          email: newUserEmail.trim(),
          password: newUserPassword,
          name: newUserName.trim() || null,
          tenantMemberships: validMemberships
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      alert('User created successfully!')
      setNewUserEmail('')
      setNewUserPassword('')
      setNewUserName('')
      setNewUserMemberships([{ tenant_id: '', role: 'tenant_user' }])
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to create user')
    } finally {
      setCreatingUser(false)
    }
  }

  function addMembership() {
    setNewUserMemberships([...newUserMemberships, { tenant_id: '', role: 'tenant_user' }])
  }

  function removeMembership(index: number) {
    if (newUserMemberships.length === 1) return
    setNewUserMemberships(newUserMemberships.filter((_, i) => i !== index))
  }

  function updateMembership(index: number, field: keyof TenantMembership, value: string) {
    const updated = [...newUserMemberships]
    updated[index] = { ...updated[index], [field]: value }
    setNewUserMemberships(updated)
  }

  async function openManageTenantFeatures(tenant: Tenant) {
    try {
      setManagingTenantId(tenant.id)
      setManagingTenantName(tenant.name)
      
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(
        `${base}/api/super-admin?action=getTenantFeatures&tenantId=${tenant.id}`,
        { headers: getAuthHeaders() }
      )
      
      if (!res.ok) throw new Error('Failed to load tenant features')
      
      const data = await res.json()
      setManagingTenantFeatures(data.features || DEFAULT_FEATURES)
    } catch (e: any) {
      alert(e?.message || 'Failed to load features')
      setManagingTenantId(null)
    }
  }

  async function handleSaveTenantFeatures() {
    if (!managingTenantId) return
    
    try {
      setSavingFeatures(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'updateTenantFeatures',
          tenantId: managingTenantId,
          features: managingTenantFeatures
        })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save features')
      }
      
      alert('Tenant features updated successfully!')
      setManagingTenantId(null)
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to save features')
    } finally {
      setSavingFeatures(false)
    }
  }

  function toggleFeature(featureId: FeatureId) {
    if (managingTenantFeatures.includes(featureId)) {
      setManagingTenantFeatures(managingTenantFeatures.filter(f => f !== featureId))
    } else {
      setManagingTenantFeatures([...managingTenantFeatures, featureId])
    }
  }

  async function openManageIcons(tenant: Tenant) {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(
        `${base}/api/tenant-icons?tenant_id=${tenant.id}`,
        { headers: getAuthHeaders() }
      )
      
      if (!res.ok) throw new Error('Failed to load tenant icons')
      
      const data = await res.json()
      setManagingIconsTenant(data)
      setManagingIconsTenantId(tenant.id)
    } catch (e: any) {
      alert(e?.message || 'Failed to load icons')
    }
  }

  async function handleIconUpload(iconType: '192' | '512' | 'favicon', file: File) {
    if (!managingIconsTenantId) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB')
      return
    }

    setUploadingIcon(true)
    try {
      // Read file as base64
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/tenant-icons`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenant_id: managingIconsTenantId,
            icon_type: iconType,
            icon_data: base64,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Upload failed')
        }

        alert(`Icon uploaded successfully!`)
        await openManageIcons({ id: managingIconsTenantId } as Tenant)
      }
      
      reader.readAsDataURL(file)
    } catch (e: any) {
      alert(e?.message || 'Upload failed')
    } finally {
      setUploadingIcon(false)
    }
  }

  async function handleDeleteIcon(iconType: string) {
    if (!managingIconsTenantId) return
    if (!confirm(`Delete ${iconType} icon?`)) return

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(
        `${base}/api/tenant-icons?tenant_id=${managingIconsTenantId}&icon_type=${iconType}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }
      )

      if (!res.ok) throw new Error('Delete failed')

      alert('Icon deleted')
      await openManageIcons({ id: managingIconsTenantId } as Tenant)
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
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
        <h2 style={{ margin: 0 }}>Super Admin</h2>
        <p className="helper" style={{ marginTop: 8 }}>Manage tenants and users across the platform</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={activeTab === 'tenants' ? 'primary' : ''}
          onClick={() => setActiveTab('tenants')}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          Tenants ({tenants.length})
        </button>
        <button
          className={activeTab === 'users' ? 'primary' : ''}
          onClick={() => setActiveTab('users')}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          Users ({users.length})
        </button>
      </div>

      {/* Tenants Tab */}
      {activeTab === 'tenants' && (
        <>
          {/* Create Tenant Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3>Create New Tenant</h3>
            <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
              <div>
                <label>Tenant Name</label>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  style={{ height: CONTROL_H }}
                />
              </div>
              <div>
                <label>Business Type</label>
                <select
                  value={newTenantBusinessType}
                  onChange={(e) => setNewTenantBusinessType(e.target.value)}
                  style={{ height: CONTROL_H }}
                >
                  <option value="general">General</option>
                  <option value="physical_store">Physical Store</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="primary"
                onClick={handleCreateTenant}
                disabled={creatingTenant || !newTenantName.trim()}
                style={{ height: CONTROL_H, width: '100%' }}
              >
                {creatingTenant ? 'Creating...' : 'Create Tenant'}
              </button>
            </div>
          </div>

          {/* Tenants List */}
          <div className="card">
            <h3>Existing Tenants</h3>
            {tenants.length === 0 ? (
              <p className="helper">No tenants yet</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                {tenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                      <div className="helper" style={{ fontSize: 12, marginTop: 4 }}>
                        Type: {tenant.business_type === 'physical_store' ? 'Physical Store' : 'General'}
                      </div>
                      <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                        Features: {tenant.features?.length || 0} enabled
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => openManageTenantFeatures(tenant)}
                        style={{
                          height: 36,
                          padding: '0 16px',
                          fontSize: 13,
                        }}
                      >
                        Features
                      </button>
                      <button
                        onClick={() => openManageIcons(tenant)}
                        style={{
                          height: 36,
                          padding: '0 16px',
                          fontSize: 13,
                        }}
                      >
                        Icons
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <>
          {/* Create User Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3>Create New User</h3>
            
            <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
              <div>
                <label>Email *</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{ height: CONTROL_H }}
                />
              </div>
              <div>
                <label>Name (optional)</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="John Doe"
                  style={{ height: CONTROL_H }}
                />
              </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <div>
                <label>Password *</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  style={{ height: CONTROL_H }}
                />
              </div>
            </div>

            {/* Tenant Memberships */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ margin: 0 }}>Tenant Access *</label>
                <button
                  onClick={addMembership}
                  style={{
                    height: 32,
                    fontSize: 13,
                    padding: '0 12px',
                  }}
                >
                  + Add Tenant
                </button>
              </div>

              {newUserMemberships.map((membership, index) => (
                <div key={index} className="row row-2col-mobile" style={{ marginTop: 8 }}>
                  <div>
                    <select
                      value={membership.tenant_id}
                      onChange={(e) => updateMembership(index, 'tenant_id', e.target.value)}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="">Select tenant...</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={membership.role}
                      onChange={(e) => updateMembership(index, 'role', e.target.value)}
                      style={{ height: CONTROL_H, flex: 1 }}
                    >
                      <option value="tenant_user">User</option>
                      <option value="tenant_admin">Tenant Admin</option>
                    </select>
                    {newUserMemberships.length > 1 && (
                      <button
                        onClick={() => removeMembership(index)}
                        style={{
                          height: CONTROL_H,
                          width: CONTROL_H,
                          padding: 0,
                          backgroundColor: 'salmon',
                          color: 'white',
                          border: 'none',
                        }}
                      >
                        −
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <button
                className="primary"
                onClick={handleCreateUser}
                disabled={creatingUser}
                style={{ height: CONTROL_H, width: '100%' }}
              >
                {creatingUser ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>

          {/* Users List */}
          <div className="card">
            <h3>Existing Users</h3>
            {users.length === 0 ? (
              <p className="helper">No users yet</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                {users.map((user) => (
                  <div
                    key={user.id}
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
                      <div style={{ fontWeight: 600 }}>{user.email}</div>
                      {user.name && (
                        <div style={{ marginTop: 4 }}>{user.name}</div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        {user.tenants && user.tenants.length > 0 ? (
                          user.tenants.map((tm, idx) => (
                            <div key={idx} className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                              • {tm.tenant_name} ({tm.role})
                            </div>
                          ))
                        ) : (
                          <div className="helper" style={{ fontSize: 12, color: 'salmon' }}>
                            No tenant access
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setManagingUserId(user.id)}
                      style={{
                        height: 36,
                        padding: '0 16px',
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      Manage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Manage User Modal */}
      {managingUserId && (
        <ManageUserModal
          userId={managingUserId}
          onClose={() => setManagingUserId(null)}
          onUpdate={loadData}
        />
      )}

      {/* Manage Tenant Features Modal */}
      {managingTenantId && (
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
          onClick={() => setManagingTenantId(null)}
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
            <h3 style={{ marginTop: 0 }}>Manage Features: {managingTenantName}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Select which features this tenant has access to
            </p>

            <div style={{ marginTop: 20 }}>
              {Object.entries(FEATURE_CATEGORIES).map(([categoryKey, categoryName]) => {
                const categoryFeatures = getFeaturesByCategory(categoryKey as keyof typeof FEATURE_CATEGORIES)
                
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
                      {categoryFeatures.map((feature) => (
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
                            checked={managingTenantFeatures.includes(feature.id as FeatureId)}
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

            <div
              style={{
                marginTop: 20,
                display: 'flex',
                gap: 8,
              }}
            >
              <button
                className="primary"
                onClick={handleSaveTenantFeatures}
                disabled={savingFeatures}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {savingFeatures ? 'Saving...' : 'Save Features'}
              </button>
              <button
                onClick={() => setManagingTenantId(null)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Tenant Icons Modal */}
      {managingIconsTenantId && managingIconsTenant && (
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
          onClick={() => setManagingIconsTenantId(null)}
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
            <h3 style={{ marginTop: 0 }}>Manage Icons: {managingIconsTenant.name}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Upload custom icons for this tenant's app
            </p>

            <div style={{ marginTop: 24, display: 'grid', gap: 20 }}>
              {[
                { type: '192', label: 'Small Icon (192x192)', key: 'app_icon_192' as const },
                { type: '512', label: 'Large Icon (512x512)', key: 'app_icon_512' as const },
                { type: 'favicon', label: 'Favicon (Browser Tab)', key: 'favicon' as const },
              ].map(({ type, label, key }) => (
                <div
                  key={type}
                  style={{
                    padding: 16,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>{label}</div>
                  
                  {managingIconsTenant[key] ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <img
                        src={`/.netlify/functions/serve-icon?tenant_id=${managingIconsTenantId}&type=${type}`}
                        alt={label}
                        style={{ 
                          width: 80, 
                          height: 80, 
                          objectFit: 'contain',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 8,
                          background: 'rgba(255,255,255,0.05)'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/icons/icon-192.png'
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className="helper" style={{ fontSize: 12, marginBottom: 8 }}>
                          Current icon set
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
  <input
    id={`replace-${type}`}
    type="file"
    accept="image/*"
    onChange={(e) => {
      const file = e.target.files?.[0]
      if (file) {
        console.log('File selected for replace:', file.name)
        handleIconUpload(type as any, file)
      }
      e.target.value = '' // Reset input
    }}
    disabled={uploadingIcon}
    style={{ display: 'none' }}
  />
  <button
    onClick={() => {
      console.log('Replace button clicked')
      document.getElementById(`replace-${type}`)?.click()
    }}
    disabled={uploadingIcon}
    style={{
      width: '100%',
      height: 32,
      padding: '0 12px',
      fontSize: 12,
    }}
  >
    {uploadingIcon ? 'Uploading...' : 'Replace'}
  </button>
</div>
                          <button
                            onClick={() => handleDeleteIcon(type)}
                            style={{
                              height: 32,
                              padding: '0 12px',
                              fontSize: 12,
                              background: 'transparent',
                              border: '1px solid salmon',
                              borderRadius: 4,
                              color: 'salmon',
                              cursor: 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
    <div className="helper" style={{ fontSize: 12, marginBottom: 8 }}>
      No icon set - using default
    </div>
    <input
      id={`upload-${type}`}
      type="file"
      accept="image/*"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) {
          console.log('File selected:', file.name)
          handleIconUpload(type as any, file)
        }
        e.target.value = '' // Reset input after upload
      }}
      disabled={uploadingIcon}
      style={{ display: 'none' }}
    />
    <button
      onClick={() => {
        console.log('Upload button clicked')
        document.getElementById(`upload-${type}`)?.click()
      }}
      disabled={uploadingIcon}
      className="primary"
      style={{
        width: '100%',
        height: 36,
        padding: '0 16px',
        fontSize: 13,
      }}
    >
      {uploadingIcon ? 'Uploading...' : 'Upload Icon'}
    </button>
  </div>
)}
                </div>
              ))}
            </div>

            <div className="helper" style={{ marginTop: 20, fontSize: 12, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
              <strong>Tip:</strong> PNG format recommended. Small icon: 192x192px, Large icon: 512x512px, Favicon: any size. Max 2MB per file.
            </div>

            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setManagingIconsTenantId(null)}
                style={{ height: CONTROL_H, width: '100%' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}