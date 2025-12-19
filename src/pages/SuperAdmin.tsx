// src/pages/SuperAdmin.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders } from '../lib/api'
import ManageUserModal from '../components/ManageUserModal'

interface Tenant {
  id: string
  name: string
  created_at: string
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
  const [creatingTenant, setCreatingTenant] = useState(false)
  
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
          name: newTenantName.trim()
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create tenant')
      }

      alert('Tenant created successfully!')
      setNewTenantName('')
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
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
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
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                    <div className="helper" style={{ fontSize: 12, marginTop: 4 }}>
                      ID: {tenant.id}
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
    </div>
  )
}