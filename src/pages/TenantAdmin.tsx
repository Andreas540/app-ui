// src/pages/TenantAdmin.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import type { FeatureId } from '../lib/features'
import { AVAILABLE_FEATURES } from '../lib/features'
import { MODULES } from '../lib/modules'

interface TenantUser {
  id: string
  email: string
  name: string | null
  role: 'tenant_admin' | 'tenant_user'
  features: FeatureId[] | null
  active: boolean
  preferred_language?: string | null
  preferred_currency?: string | null
  preferred_timezone?: string | null
}

interface TenantGeo {
  default_language: string
  default_currency: string
  default_timezone: string
  default_locale: string
}

export default function TenantAdmin() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [users, setUsers] = useState<TenantUser[]>([])
  const [tenantFeatures, setTenantFeatures] = useState<FeatureId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Manage user features modal
  const [managingUserId, setManagingUserId] = useState<string | null>(null)
  const [managingUserName, setManagingUserName] = useState('')
  const [managingUserFeatures, setManagingUserFeatures] = useState<FeatureId[]>([])
  const [savingFeatures, setSavingFeatures] = useState(false)

  // Create user modal
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState<'tenant_user' | 'tenant_admin'>('tenant_user')
  const [newUserFeatures, setNewUserFeatures] = useState<FeatureId[]>([])
  const [creatingUser, setCreatingUser] = useState(false)

  // Toggle user status
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)

  // Tenant geo defaults
  const [tenantGeo, setTenantGeo] = useState<TenantGeo>({
    default_language: 'en', default_currency: 'USD',
    default_timezone: 'UTC', default_locale: 'en-US',
  })

  // User geo management
  const [managingGeoUserId, setManagingGeoUserId] = useState<string | null>(null)
  const [managingGeoUserName, setManagingGeoUserName] = useState('')
  const [editingGeoLanguage, setEditingGeoLanguage] = useState<string | null>(null)
  const [editingGeoCurrency, setEditingGeoCurrency] = useState<string | null>(null)
  const [editingGeoTimezone, setEditingGeoTimezone] = useState<string | null>(null)
  const [savingGeo, setSavingGeo] = useState(false)

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
      if (data.tenantGeo) setTenantGeo(data.tenantGeo)

    } catch (e: any) {
      setError(e?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function openManageUserFeatures(targetUser: TenantUser) {
    setManagingUserId(targetUser.id)
    setManagingUserName(targetUser.name || targetUser.email)
    const allFeatures: FeatureId[] = MODULES.flatMap(m => m.features)
    if (targetUser.features === null) {
      setManagingUserFeatures(allFeatures)
    } else {
      const stored = targetUser.features
      const expanded = [...stored]
      // Only auto-add features from always-included modules (e.g. Admin)
      // Paid module features are respected exactly as stored
      MODULES.forEach(mod => {
        if (mod.alwaysIncluded) {
          mod.features.forEach(f => {
            if (!expanded.includes(f)) {
              if (f === 'tenant-admin' && targetUser.role === 'tenant_user') return
              expanded.push(f)
            }
          })
        }
      })
      setManagingUserFeatures(expanded)
    }
  }

  function openManageUserGeo(targetUser: TenantUser) {
    setManagingGeoUserId(targetUser.id)
    setManagingGeoUserName(targetUser.name || targetUser.email)
    setEditingGeoLanguage(targetUser.preferred_language ?? null)
    setEditingGeoCurrency(targetUser.preferred_currency ?? null)
    setEditingGeoTimezone(targetUser.preferred_timezone ?? null)
  }

  async function handleSaveUserGeo() {
    if (!managingGeoUserId) return
    try {
      setSavingGeo(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')
      const res = await fetch(`${base}/api/tenant-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
        },
        body: JSON.stringify({
          action: 'updateUserGeo',
          userId: managingGeoUserId,
          language: editingGeoLanguage,
          currency: editingGeoCurrency,
          timezone: editingGeoTimezone,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      alert(t('tenantAdmin.geoSaved'))
      setManagingGeoUserId(null)
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to save geo settings')
    } finally {
      setSavingGeo(false)
    }
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
          features: managingUserFeatures,
          modules: MODULES
            .filter(mod => !mod.alwaysIncluded && mod.features.some(f => managingUserFeatures.includes(f)))
            .map(mod => mod.id)
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save features')
      }

      alert(t('tenantAdmin.permissionsUpdated'))
      setManagingUserId(null)
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to save features')
    } finally {
      setSavingFeatures(false)
    }
  }

  async function handleToggleUserStatus(userId: string, currentlyActive: boolean) {
    try {
      setTogglingUserId(userId)
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
          action: 'toggleUserStatus',
          userId: userId,
          isActive: !currentlyActive
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update user status')
      }

      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to update user status')
    } finally {
      setTogglingUserId(null)
    }
  }
  async function handleManageSubscription() {
    try {
      setLoadingPortal(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')

      const res = await fetch(`${base}/api/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
        },
        body: JSON.stringify({
          returnUrl: window.location.href
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to open subscription portal')
      }

      const data = await res.json()
      window.location.href = data.url
    } catch (e: any) {
      alert(e?.message || 'Failed to open subscription portal')
    } finally {
      setLoadingPortal(false)
    }
  }

  function openCreateUser() {
    setNewUserEmail('')
    setNewUserPassword('')
    setNewUserName('')
    setNewUserRole('tenant_user')
    setNewUserFeatures(MODULES.flatMap(m => m.features)
      .filter(f => newUserRole === 'tenant_user' ? f !== 'tenant-admin' : true))
    setShowCreateUser(true)
  }

  async function handleCreateUser() {
    if (!newUserEmail.trim()) {
      alert(t('tenantAdmin.alertEnterEmail'))
      return
    }
    if (newUserPassword.length < 8) {
      alert(t('tenantAdmin.alertPasswordLength'))
      return
    }

    try {
      setCreatingUser(true)
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
          action: 'createUser',
          email: newUserEmail.trim(),
          password: newUserPassword,
          name: newUserName.trim() || null,
          role: newUserRole,
          features: newUserFeatures
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create user')
      }

      alert(t('tenantAdmin.userCreated'))
      setShowCreateUser(false)
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to create user')
    } finally {
      setCreatingUser(false)
    }
  }

  function toggleFeature(featureId: FeatureId, isNewUser: boolean = false) {
    if (isNewUser) {
      if (newUserFeatures.includes(featureId)) {
        setNewUserFeatures(newUserFeatures.filter(f => f !== featureId))
      } else {
        setNewUserFeatures([...newUserFeatures, featureId])
      }
    } else {
      if (managingUserFeatures.includes(featureId)) {
        setManagingUserFeatures(managingUserFeatures.filter(f => f !== featureId))
      } else {
        setManagingUserFeatures([...managingUserFeatures, featureId])
      }
    }
  }

  function selectAllFeatures(isNewUser: boolean = false) {
    if (isNewUser) {
      setNewUserFeatures(MODULES.flatMap(m => m.features)
        .filter(f => newUserRole === 'tenant_user' ? f !== 'tenant-admin' : true))
    } else {
      const targetUser = users.find(u => u.id === managingUserId)
      setManagingUserFeatures(MODULES.flatMap(m => m.features)
        .filter(f => targetUser?.role === 'tenant_user' ? f !== 'tenant-admin' : true))
    }
  }

  function clearAllFeatures(isNewUser: boolean = false) {
    if (isNewUser) {
      setNewUserFeatures([])
    } else {
      setManagingUserFeatures([])
    }
  }

  function getAvailableModuleFeatures(moduleFeatures: FeatureId[]): FeatureId[] {
    return moduleFeatures
  }

  function isModuleFullyChecked(moduleFeatures: FeatureId[], currentFeatures: FeatureId[]): boolean {
    const available = getAvailableModuleFeatures(moduleFeatures)
    if (available.length === 0) return false
    return available.every(f => currentFeatures.includes(f))
  }

  function isModulePartiallyChecked(moduleFeatures: FeatureId[], currentFeatures: FeatureId[]): boolean {
    const available = getAvailableModuleFeatures(moduleFeatures)
    const checked = available.filter(f => currentFeatures.includes(f))
    return checked.length > 0 && checked.length < available.length
  }

  function toggleModule(moduleFeatures: FeatureId[], currentFeatures: FeatureId[], isNewUser: boolean = false) {
    const available = getAvailableModuleFeatures(moduleFeatures)
    const fullyChecked = isModuleFullyChecked(moduleFeatures, currentFeatures)
    let updated: FeatureId[]
    if (fullyChecked) {
      updated = currentFeatures.filter(f => !available.includes(f))
    } else {
      updated = [...currentFeatures]
      available.forEach(f => { if (!updated.includes(f)) updated.push(f) })
    }
    if (isNewUser) {
      setNewUserFeatures(updated)
    } else {
      setManagingUserFeatures(updated)
    }
  }

  if (loading) return <div className="card"><p>{t('loading')}</p></div>

  if (error) return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3 style={{ color: 'salmon' }}>{t('error')}</h3>
      <p>{error}</p>
    </div>
  )

  const CONTROL_H = 44

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t('tenantAdmin.title')}</h2>
        <p className="helper" style={{ marginTop: 8 }}>
  {t('tenantAdmin.subtitle', { name: user?.tenantName || 'your organization' })}
</p>
        <p className="helper" style={{ marginTop: 4, fontSize: 12 }}>
          {t('tenantAdmin.featuresInfo', { count: tenantFeatures.length })}
        </p>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleManageSubscription}
            disabled={loadingPortal}
            style={{ height: CONTROL_H, padding: '0 20px' }}
          >
            {loadingPortal ? t('loadingDots') : t('tenantAdmin.manageSubscription')}
          </button>
        </div>
        <p className="helper" style={{ marginTop: 8 }}>
  {t('tenantAdmin.changeModulesInfo')}
</p>
      </div>

      {/* Users List */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t('tenantAdmin.teamMembers')}</h3>
          <button
            className="primary"
            onClick={openCreateUser}
            disabled={true}
            style={{ height: 36, padding: '0 16px', fontSize: 13, opacity: 0.4, cursor: 'not-allowed' }}
          >
            {t('tenantAdmin.createUserButton')}
          </button>
        </div>

        {users.length === 0 ? (
          <p className="helper">{t('tenantAdmin.noUsers')}</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
  padding: '12px 0',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  opacity: u.active ? 1 : 0.5,
}}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{u.email}</div>
                  {u.name && (
                    <div style={{ marginTop: 4 }}>{u.name}</div>
                  )}
                  <div className="helper" style={{ fontSize: 12, marginTop: 4 }}>
                    {t('tenantAdmin.roleLabel')} {u.role === 'tenant_admin' ? t('adminRole') : t('userRole')}
                  </div>
                  <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                    {u.features === null
                      ? t('tenantAdmin.accessAll', { count: tenantFeatures.length })
                      : t('tenantAdmin.accessCount', { count: u.features.length, total: tenantFeatures.length })
                    }
                  </div>
                  {!u.active && (
                    <div style={{ color: 'salmon', fontSize: 12, marginTop: 2 }}>
                      {t('inactive')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
  <button
    onClick={() => handleToggleUserStatus(u.id, u.active)}
    disabled={togglingUserId === u.id}
    style={{
      height: 36,
      padding: '0 12px',
      fontSize: 13,
      background: u.active ? '#4CAF50' : '#ff6b6b',
      border: u.active ? '1px solid #4CAF50' : '1px solid #ff6b6b',
      color: 'white',
    }}
  >
    {togglingUserId === u.id ? '...' : (u.active ? t('active') : t('inactive'))}
  </button>
                  <button
                    onClick={() => openManageUserFeatures(u)}
                    disabled={!u.active}
                    style={{ height: 36, padding: '0 16px', fontSize: 13 }}
                  >
                    {t('tenantAdmin.permissionsButton')}
                  </button>
                  <button
                    onClick={() => openManageUserGeo(u)}
                    disabled={!u.active}
                    style={{ height: 36, padding: '0 16px', fontSize: 13 }}
                  >
                    {t('tenantAdmin.geoButton')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateUser && (
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
          onClick={() => setShowCreateUser(false)}
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
            <h3 style={{ marginTop: 0 }}>{t('createUser.title')}</h3>

            <div style={{ marginTop: 16 }}>
              <label>{t('createUser.emailRequired')}</label>
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder={t('createUser.emailPlaceholder')}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('createUser.nameOptional')}</label>
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder={t('createUser.namePlaceholder')}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('createUser.passwordRequired')}</label>
              <input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder={t('tenantAdmin.passwordPlaceholder')}
                autoComplete="new-password"
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('tenantAdmin.roleRequired')}</label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as 'tenant_user' | 'tenant_admin')}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="tenant_user">{t('userRole')}</option>
                <option value="tenant_admin">{t('adminRole')}</option>
              </select>
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ margin: 0, fontWeight: 600 }}>{t('tenantAdmin.permissionsLabel')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => selectAllFeatures(true)}
                    style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                  >
                    {t('tenantAdmin.selectAll')}
                  </button>
                  <button
                    onClick={() => clearAllFeatures(true)}
                    style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                  >
                    {t('tenantAdmin.clearAll')}
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                {MODULES.map((mod) => {
                  const availableFeatures = mod.features
                  if (availableFeatures.length === 0) return null
                  const fullyChecked = isModuleFullyChecked(mod.features, newUserFeatures)
                  const partiallyChecked = isModulePartiallyChecked(mod.features, newUserFeatures)
                  return (
                    <div key={mod.id} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={fullyChecked}
                          ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = partiallyChecked }}
                          onChange={() => toggleModule(mod.features, newUserFeatures, true)}
                          style={{ width: 16, height: 16 }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--primary)' }}>{mod.name}</span>
                      </label>
                      <div style={{ display: 'grid', gap: 6, paddingLeft: 24 }}>
                        {availableFeatures.map((featureId) => {
                          const feature = AVAILABLE_FEATURES[featureId]
                          if (!feature) return null
                          return (
                            <label
                              key={featureId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: 8,
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 13,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={newUserFeatures.includes(featureId)}
                                onChange={() => toggleFeature(featureId, true)}
                                style={{ width: 16, height: 16 }}
                              />
                              <span>{feature.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={handleCreateUser}
                disabled={creatingUser}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {creatingUser ? t('createUser.creatingText') : t('createUser.createButton')}
              </button>
              <button
                onClick={() => setShowCreateUser(false)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <h3 style={{ marginTop: 0 }}>{t('tenantAdmin.managePermissionsTitle', { name: managingUserName })}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              {t('tenantAdmin.featureSelectHelp')}
            </p>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={() => selectAllFeatures(false)}
                style={{ flex: 1, height: 36, fontSize: 13 }}
              >
                {t('tenantAdmin.selectAll')}
              </button>
              <button
                onClick={() => clearAllFeatures(false)}
                style={{ flex: 1, height: 36, fontSize: 13 }}
              >
                {t('tenantAdmin.clearAll')}
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              {MODULES.map((mod) => {
                const availableFeatures = mod.features
                if (availableFeatures.length === 0) return null
                const fullyChecked = isModuleFullyChecked(mod.features, managingUserFeatures)
                const partiallyChecked = isModulePartiallyChecked(mod.features, managingUserFeatures)
                return (
                  <div key={mod.id} style={{ marginBottom: 24 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={fullyChecked}
                        ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = partiallyChecked }}
                        onChange={() => toggleModule(mod.features, managingUserFeatures, false)}
                        style={{ width: 20, height: 20 }}
                      />
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>{mod.name}</span>
                    </label>
                    <div style={{ display: 'grid', gap: 8, paddingLeft: 32 }}>
                      {availableFeatures.map((featureId) => {
                        const feature = AVAILABLE_FEATURES[featureId]
                        if (!feature) return null
                        return (
                          <label
                            key={featureId}
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
                              checked={managingUserFeatures.includes(featureId)}
                              onChange={() => toggleFeature(featureId, false)}
                              style={{ width: 20, height: 20 }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600 }}>{feature.name}</div>
                              <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>{feature.route}</div>
                            </div>
                          </label>
                        )
                      })}
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
                {savingFeatures ? t('saving') : t('tenantAdmin.savePermissions')}
              </button>
              <button
                onClick={() => setManagingUserId(null)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage User Geo Modal */}
      {managingGeoUserId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
          onClick={() => setManagingGeoUserId(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{t('tenantAdmin.geoSettingsTitle', { name: managingGeoUserName })}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              {t('tenantAdmin.geoHelp')}
            </p>

            <div style={{ marginTop: 16 }}>
              <label>{t('tenantAdmin.language')}</label>
              <select
                value={editingGeoLanguage ?? ''}
                onChange={(e) => setEditingGeoLanguage(e.target.value || null)}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="">{t('tenantAdmin.useTenantDefault', { default: tenantGeo.default_language })}</option>
                <option value="en">{t('tenantAdmin.langEnglish')}</option>
                <option value="sv">{t('tenantAdmin.langSwedish')}</option>
                <option value="es">{t('tenantAdmin.langSpanish')}</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('tenantAdmin.currency')}</label>
              <select
                value={editingGeoCurrency ?? ''}
                onChange={(e) => setEditingGeoCurrency(e.target.value || null)}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="">{t('tenantAdmin.useTenantDefault', { default: tenantGeo.default_currency })}</option>
                <option value="USD">USD – US Dollar</option>
                <option value="SEK">SEK – Swedish Krona</option>
                <option value="EUR">EUR – Euro</option>
                <option value="GBP">GBP – British Pound</option>
                <option value="NOK">NOK – Norwegian Krone</option>
                <option value="DKK">DKK – Danish Krone</option>
                <option value="CAD">CAD – Canadian Dollar</option>
                <option value="AUD">AUD – Australian Dollar</option>
                <option value="MXN">MXN – Mexican Peso</option>
                <option value="GHS">GHS – Ghanaian Cedi</option>
                <option value="BRL">BRL – Brazilian Real</option>
                <option value="JPY">JPY – Japanese Yen</option>
                <option value="CHF">CHF – Swiss Franc</option>
                <option value="SGD">SGD – Singapore Dollar</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('tenantAdmin.timezone')}</label>
              <select
                value={editingGeoTimezone ?? ''}
                onChange={(e) => setEditingGeoTimezone(e.target.value || null)}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="">{t('tenantAdmin.useTenantDefault', { default: tenantGeo.default_timezone })}</option>
                <option value="UTC">UTC</option>
                <optgroup label="Americas">
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  <option value="America/Toronto">America/Toronto</option>
                  <option value="America/Vancouver">America/Vancouver</option>
                  <option value="America/Mexico_City">America/Mexico_City</option>
                  <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                  <option value="America/Bogota">America/Bogota</option>
                </optgroup>
                <optgroup label="Europe">
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Stockholm">Europe/Stockholm (CET)</option>
                  <option value="Europe/Oslo">Europe/Oslo</option>
                  <option value="Europe/Copenhagen">Europe/Copenhagen</option>
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                  <option value="Europe/Rome">Europe/Rome</option>
                  <option value="Europe/Madrid">Europe/Madrid</option>
                  <option value="Europe/Helsinki">Europe/Helsinki</option>
                </optgroup>
                <optgroup label="Africa">
                  <option value="Africa/Accra">Africa/Accra</option>
                  <option value="Africa/Lagos">Africa/Lagos</option>
                  <option value="Africa/Nairobi">Africa/Nairobi</option>
                  <option value="Africa/Cairo">Africa/Cairo</option>
                  <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                </optgroup>
                <optgroup label="Asia / Pacific">
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Bangkok">Asia/Bangkok</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                  <option value="Australia/Sydney">Australia/Sydney</option>
                  <option value="Pacific/Auckland">Pacific/Auckland</option>
                </optgroup>
              </select>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={handleSaveUserGeo}
                disabled={savingGeo}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {savingGeo ? t('saving') : t('tenantAdmin.saveGeo')}
              </button>
              <button
                onClick={() => setManagingGeoUserId(null)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
