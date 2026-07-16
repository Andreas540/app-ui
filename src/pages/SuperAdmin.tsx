// src/pages/SuperAdmin.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getAuthHeaders } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import ManageUserModal from '../components/ManageUserModal'
import type { FeatureId } from '../lib/features'
import { AVAILABLE_FEATURES } from '../lib/features'
import { MODULES } from '../lib/modules'
import { FRONT_PAGES } from '../lib/frontPages'

interface Tenant {
  id: string
  name: string
  business_type: string
  features?: FeatureId[]
  created_at: string
  stripe_customer_id?: string | null
  default_language?: string | null
  default_currency?: string | null
  default_timezone?: string | null
}

interface BusinessType {
  id: string
  label: string
  config_defaults: Record<string, unknown>
  is_active: boolean
}

interface TenantIcon {
  id: string
  name: string
  app_name: string | null
  app_icon_192: string | null
  app_icon_512: string | null
  favicon: string | null
}

interface User {
  id: string
  email: string
  name: string | null
  active: boolean
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

interface WebhookEvent {
  id: string
  tenant_id: string | null
  tenant_name: string | null
  provider: string
  event_type: string
  external_event_id: string | null
  processed: boolean
  processed_at: string | null
  processing_error: string | null
  created_at: string
  payload: Record<string, unknown>
}

export default function SuperAdmin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { verifyAuth } = useAuth()
  
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Business types
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([])
  const [btActiveTab, setBtActiveTab] = useState<'list' | 'new'>('list')
  const [newBtId, setNewBtId] = useState('')
  const [newBtLabel, setNewBtLabel] = useState('')
  const [creatingBt, setCreatingBt] = useState(false)
  const [editingBtId, setEditingBtId] = useState<string | null>(null)
  const [editingBtLabel, setEditingBtLabel] = useState('')
  const [editingBtConfig, setEditingBtConfig] = useState('')
  const [savingBt, setSavingBt] = useState(false)
  const [btConfigError, setBtConfigError] = useState<string | null>(null)
  const [btPageConfig, setBtPageConfig] = useState<{ btId: string; pageId: string } | null>(null)
  const [btFieldConfig, setBtFieldConfig] = useState<Record<string, boolean>>({})
  const [btFieldConfigService, setBtFieldConfigService] = useState<Record<string, boolean>>({})
  const [btPreviewTab, setBtPreviewTab] = useState<'product' | 'service'>('product')
  const [savingBtPageConfig, setSavingBtPageConfig] = useState(false)
  const [btThemeDefaultSkin, setBtThemeDefaultSkin] = useState<'default' | 'vintage' | 'pool'>('default')
  const [btThemeDefaultMode, setBtThemeDefaultMode] = useState<'dark' | 'light'>('dark')
  const [btThemeSelectableSkins, setBtThemeSelectableSkins] = useState<('default' | 'vintage' | 'pool')[]>(['default', 'vintage'])
  const [btThemeSelectableModes, setBtThemeSelectableModes] = useState<('dark' | 'light')[]>(['dark', 'light'])
  const [savingBtTheme, setSavingBtTheme] = useState(false)
  const [btFrontPageKey, setBtFrontPageKey] = useState<string>('')
  const [savingBtFrontPage, setSavingBtFrontPage] = useState(false)
  const [editingTenantBtId, setEditingTenantBtId] = useState<string | null>(null)
  const [editingTenantBtValue, setEditingTenantBtValue] = useState('')
  const [savingTenantBt, setSavingTenantBt] = useState(false)

  // Create tenant form
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantBusinessType, setNewTenantBusinessType] = useState('general')
  const [creatingTenant, setCreatingTenant] = useState(false)

  // Icon management state
  const [managingIconsTenantId, setManagingIconsTenantId] = useState<string | null>(null)
  const [managingIconsTenant, setManagingIconsTenant] = useState<TenantIcon | null>(null)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [editingAppName, setEditingAppName] = useState('')
  const [savingAppName, setSavingAppName] = useState(false)
  const [editingTenantName, setEditingTenantName] = useState('')
  const [savingTenantName, setSavingTenantName] = useState(false)
  
  // Create user form
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserMemberships, setNewUserMemberships] = useState<TenantMembership[]>([
    { tenant_id: '', role: 'tenant_user' }
  ])
  const [creatingUser, setCreatingUser] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<'tenants' | 'users' | 'webhooks' | 'business-types'>('tenants')

  // Webhook events state
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
  const [webhookTotal, setWebhookTotal] = useState(0)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [webhookOffset, setWebhookOffset] = useState(0)
  const [webhookFilterTenantId, setWebhookFilterTenantId] = useState('')
  const [webhookFilterProvider, setWebhookFilterProvider] = useState('')
  const [webhookFilterProcessed, setWebhookFilterProcessed] = useState('')
  const [webhookExpandedId, setWebhookExpandedId] = useState<string | null>(null)
  const [managingUserId, setManagingUserId] = useState<string | null>(null)
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  
  // Tenant features management
  const [managingTenantId, setManagingTenantId] = useState<string | null>(null)
  const [managingTenantName, setManagingTenantName] = useState('')
  const [managingTenantFeatures, setManagingTenantFeatures] = useState<FeatureId[]>([])
  const [savingFeatures, setSavingFeatures] = useState(false)

  // Stripe customer ID management
  const [managingStripeId, setManagingStripeId] = useState<string | null>(null)
  const [managingStripeName, setManagingStripeName] = useState('')
  const [editingStripeCustomerId, setEditingStripeCustomerId] = useState('')
  const [editingSmsPricePerUnit, setEditingSmsPricePerUnit] = useState('')
  const [editingStripeItemId, setEditingStripeItemId] = useState('')
  const [savingStripeCustomerId, setSavingStripeCustomerId] = useState(false)

  // Subscription quota management
  const [managingQuotaTenantId, setManagingQuotaTenantId] = useState<string | null>(null)
  const [managingQuotaTenantName, setManagingQuotaTenantName] = useState('')
  const [quotaValues, setQuotaValues] = useState<Record<string, number>>({})
  const [usedCounts, setUsedCounts] = useState<Record<string, number>>({})
  const [savingQuotas, setSavingQuotas] = useState(false)
  const [loadingQuotas, setLoadingQuotas] = useState(false)

  // Geo management
  const [managingGeoTenantId, setManagingGeoTenantId] = useState<string | null>(null)
  const [managingGeoTenantName, setManagingGeoTenantName] = useState('')
  const [editingGeoLanguage, setEditingGeoLanguage] = useState('en')
  const [editingGeoCurrency, setEditingGeoCurrency] = useState('USD')
  const [editingGeoTimezone, setEditingGeoTimezone] = useState('UTC')
  const [savingGeo, setSavingGeo] = useState(false)

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

      // Load business types
      const btRes = await fetch(`${base}/api/super-admin?action=listBusinessTypes`, { headers })
      if (btRes.ok) {
        const btData = await btRes.json()
        setBusinessTypes(btData.businessTypes || [])
      }

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

  async function loadWebhookEvents(offset = 0, tenantId = '', provider = '', processed = '') {
    try {
      setWebhookLoading(true)
      setWebhookError(null)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const params = new URLSearchParams({ limit: '50', offset: String(offset) })
      if (tenantId) params.set('tenantId', tenantId)
      if (provider) params.set('provider', provider)
      if (processed !== '') params.set('processed', processed)
      const res = await fetch(`${base}/api/get-webhook-events?${params}`, { headers: getAuthHeaders() })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to load webhook events')
      }
      const data = await res.json()
      setWebhookEvents(data.events || [])
      setWebhookTotal(data.total || 0)
      setWebhookOffset(offset)
    } catch (e: any) {
      setWebhookError(e?.message || 'Failed to load webhook events')
    } finally {
      setWebhookLoading(false)
    }
  }

  async function handleCreateTenant() {
    if (!newTenantName.trim()) {
      alert(t('superAdmin.alertEnterTenantName'))
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

      alert(t('superAdmin.created'))
      setNewTenantName('')
      setNewTenantBusinessType('general')
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to create tenant')
    } finally {
      setCreatingTenant(false)
    }
  }

  async function handleCreateBusinessType() {
    if (!newBtId.trim() || !newBtLabel.trim()) { alert('ID and Label are required'); return }
    try {
      setCreatingBt(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'createBusinessType', id: newBtId.trim(), label: newBtLabel.trim() })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setNewBtId(''); setNewBtLabel(''); setBtActiveTab('list')
      await loadData()
    } catch (e: any) { alert(e?.message || 'Failed') } finally { setCreatingBt(false) }
  }

  async function handleSaveBtPageConfig() {
    if (!btPageConfig) return
    const bt = businessTypes.find(b => b.id === btPageConfig.btId)
    if (!bt) return
    setSavingBtPageConfig(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const existing = bt.config_defaults as any
      const isEditProductService = btPageConfig.pageId === 'edit-product'
      const updated = {
        ...existing,
        pages: {
          ...(existing.pages ?? {}),
          [btPageConfig.pageId]: {
            ...(existing.pages?.[btPageConfig.pageId] ?? {}),
            fields: btFieldConfig,
          },
          ...(isEditProductService ? {
            'edit-service': {
              ...(existing.pages?.['edit-service'] ?? {}),
              fields: btFieldConfigService,
            }
          } : {})
        }
      }
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateBusinessType', id: bt.id, label: bt.label, configDefaults: updated })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setBtPageConfig(null)
      if (editingBtId === bt.id) setEditingBtConfig(JSON.stringify(updated, null, 2))
      await loadData()
      await verifyAuth()
    } catch (e: any) { alert(e?.message || 'Failed') } finally { setSavingBtPageConfig(false) }
  }

  async function handleSaveBtThemeConfig(bt: BusinessType) {
    setSavingBtTheme(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const existing = bt.config_defaults as any
      const updated = {
        ...existing,
        theme: {
          defaultSkin: btThemeDefaultSkin,
          defaultMode: btThemeDefaultMode,
          selectableSkins: btThemeSelectableSkins,
          selectableModes: btThemeSelectableModes,
        },
      }
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateBusinessType', id: bt.id, label: bt.label, configDefaults: updated })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      if (editingBtId === bt.id) setEditingBtConfig(JSON.stringify(updated, null, 2))
      await loadData()
    } catch (e: any) { alert(e?.message || 'Failed') } finally { setSavingBtTheme(false) }
  }

  async function handleSaveBtFrontPage(bt: BusinessType) {
    setSavingBtFrontPage(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const existing = bt.config_defaults as any
      const updated = { ...existing, frontPageKey: btFrontPageKey || null }
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateBusinessType', id: bt.id, label: bt.label, configDefaults: updated })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      if (editingBtId === bt.id) setEditingBtConfig(JSON.stringify(updated, null, 2))
      await loadData()
    } catch (e: any) { alert(e?.message || 'Failed') } finally { setSavingBtFrontPage(false) }
  }

  async function handleSaveBusinessType() {
    if (!editingBtId) return
    let parsed: Record<string, unknown> = {}
    if (editingBtConfig.trim()) {
      try { parsed = JSON.parse(editingBtConfig) } catch {
        setBtConfigError('Invalid JSON'); return
      }
    }
    setBtConfigError(null)
    const configDefaults = {
      ...parsed,
      theme: {
        defaultSkin: btThemeDefaultSkin,
        defaultMode: btThemeDefaultMode,
        selectableSkins: btThemeSelectableSkins,
        selectableModes: btThemeSelectableModes,
      },
      frontPageKey: btFrontPageKey || null,
    }
    try {
      setSavingBt(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateBusinessType', id: editingBtId, label: editingBtLabel, configDefaults })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setEditingBtId(null)
      await loadData()
      await verifyAuth()
    } catch (e: any) { alert(e?.message || 'Failed') } finally { setSavingBt(false) }
  }

  async function handleToggleBusinessType(id: string, isActive: boolean) {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const action = isActive ? 'deactivateBusinessType' : 'activateBusinessType'
    await fetch(`${base}/api/super-admin`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ action, id })
    })
    await loadData()
  }

  async function handleSaveTenantBusinessType(tenantId: string) {
    try {
      setSavingTenantBt(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateTenantBusinessType', tenantId, businessType: editingTenantBtValue })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setEditingTenantBtId(null)
      await loadData()
    } catch (e: any) { alert(e?.message || 'Failed') } finally { setSavingTenantBt(false) }
  }

  async function handleCreateUser() {
    // Validate
    if (!newUserEmail.trim()) {
      alert(t('superAdmin.alertEnterEmail'))
      return
    }
    if (newUserPassword.length < 8) {
      alert(t('superAdmin.alertPasswordLength'))
      return
    }

    const validMemberships = newUserMemberships.filter(m => m.tenant_id)
    if (validMemberships.length === 0) {
      alert(t('superAdmin.alertSelectTenant'))
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

      alert(t('superAdmin.userCreated'))
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

  async function handleDeleteUser(user: User) {
    try {
      setDeletingUserId(user.id)
      setConfirmDeleteUser(null)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'deleteUser', userId: user.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to delete user')
    } finally {
      setDeletingUserId(null)
    }
  }

  async function handleToggleUserStatus(userId: string, currentlyActive: boolean) {
    try {
      setTogglingUserId(userId)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
      const allFeatures: FeatureId[] = MODULES.flatMap(m => m.features)
      if (!data.features) {
        setManagingTenantFeatures(allFeatures)
      } else {
        const stored: FeatureId[] = data.features
        const expanded = [...stored]
        // Only auto-add always-included module features (e.g. Admin).
        // Paid module features are kept exactly as stored — new features must be
        // explicitly checked by SuperAdmin, never auto-expanded.
        MODULES.forEach(mod => {
          if (mod.alwaysIncluded) {
            mod.features.forEach(f => { if (!expanded.includes(f)) expanded.push(f) })
          }
        })
        setManagingTenantFeatures(expanded)
      }
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
      
      alert(t('superAdmin.featuresUpdated'))
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

  function isTenantModuleFullyChecked(moduleFeatures: FeatureId[]): boolean {
    if (moduleFeatures.length === 0) return false
    return moduleFeatures.every(f => managingTenantFeatures.includes(f))
  }

  function isTenantModulePartiallyChecked(moduleFeatures: FeatureId[]): boolean {
    const checked = moduleFeatures.filter(f => managingTenantFeatures.includes(f))
    return checked.length > 0 && checked.length < moduleFeatures.length
  }

  function toggleTenantModule(moduleFeatures: FeatureId[]) {
    const fullyChecked = isTenantModuleFullyChecked(moduleFeatures)
    if (fullyChecked) {
      setManagingTenantFeatures(managingTenantFeatures.filter(f => !moduleFeatures.includes(f)))
    } else {
      const updated = [...managingTenantFeatures]
      moduleFeatures.forEach(f => { if (!updated.includes(f)) updated.push(f) })
      setManagingTenantFeatures(updated)
    }
  }

  async function openManageStripe(tenant: Tenant) {
    setManagingStripeId(tenant.id)
    setManagingStripeName(tenant.name)
    setEditingStripeCustomerId(tenant.stripe_customer_id || '')
    setEditingSmsPricePerUnit('')
    setEditingStripeItemId('')
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const headers = { ...getAuthHeaders(), 'X-Active-Tenant': tenant.id } as Record<string, string>
      delete headers['x-active-tenant']
      const res = await fetch(`${base}/api/get-sms-usage`, { headers })
      if (res.ok) {
        const data = await res.json()
        setEditingSmsPricePerUnit(String(data.settings?.sms_price_per_unit ?? '0.03'))
        setEditingStripeItemId(data.settings?.stripe_sms_subscription_item_id ?? '')
      }
    } catch {}
  }

  function openManageGeo(tenant: Tenant) {
    setManagingGeoTenantId(tenant.id)
    setManagingGeoTenantName(tenant.name)
    setEditingGeoLanguage(tenant.default_language || 'en')
    setEditingGeoCurrency(tenant.default_currency || 'USD')
    setEditingGeoTimezone(tenant.default_timezone || 'UTC')
  }

  async function handleSaveTenantGeo() {
    if (!managingGeoTenantId) return
    try {
      setSavingGeo(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'updateTenantGeo',
          tenantId: managingGeoTenantId,
          language: editingGeoLanguage,
          currency: editingGeoCurrency,
          timezone: editingGeoTimezone,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      alert(t('superAdmin.geoSaved'))
      setManagingGeoTenantId(null)
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to save geo settings')
    } finally {
      setSavingGeo(false)
    }
  }

async function handleSaveStripeCustomerId() {
  if (!managingStripeId) return
  try {
    setSavingStripeCustomerId(true)
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const res = await fetch(`${base}/api/super-admin`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        action: 'updateStripeCustomerId',
        tenantId: managingStripeId,
        stripeCustomerId: editingStripeCustomerId.trim() || null,
      })
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to save')
    }
    // Save SMS billing settings (price per SMS + Stripe subscription item ID)
    const smsHeaders = { ...getAuthHeaders(), 'Content-Type': 'application/json', 'X-Active-Tenant': managingStripeId } as Record<string, string>
    delete smsHeaders['x-active-tenant']
    const smsRes = await fetch(`${base}/api/save-billing-settings`, {
      method: 'POST',
      headers: smsHeaders,
      body: JSON.stringify({
        sms_price_per_unit: editingSmsPricePerUnit ? parseFloat(editingSmsPricePerUnit) : undefined,
        stripe_sms_subscription_item_id: editingStripeItemId.trim() || null,
      }),
    })
    if (!smsRes.ok) {
      const smsData = await smsRes.json()
      throw new Error(smsData.error || 'Failed to save SMS settings')
    }
    alert(t('superAdmin.stripeSaved'))
    setManagingStripeId(null)
    await loadData()
  } catch (e: any) {
    alert(e?.message || 'Failed to save')
  } finally {
    setSavingStripeCustomerId(false)
  }
}

  async function openManageSubscription(tenant: Tenant) {
    try {
      setLoadingQuotas(true)
      setManagingQuotaTenantId(tenant.id)
      setManagingQuotaTenantName(tenant.name)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(
        `${base}/api/super-admin?action=getSubscriptionQuotas&tenantId=${tenant.id}`,
        { headers: getAuthHeaders() }
      )
      if (!res.ok) throw new Error('Failed to load quotas')
      const data = await res.json()
      const qv: Record<string, number> = {}
      for (const q of data.quotas || []) {
        qv[q.module_id] = q.max_users
      }
      setQuotaValues(qv)
      setUsedCounts(data.usedCounts || {})
    } catch (e: any) {
      alert(e?.message || 'Failed to load subscription data')
      setManagingQuotaTenantId(null)
    } finally {
      setLoadingQuotas(false)
    }
  }

  async function handleSaveSubscription() {
    if (!managingQuotaTenantId) return
    try {
      setSavingQuotas(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const quotas = Object.entries(quotaValues).map(([moduleId, maxUsers]) => ({ moduleId, maxUsers }))
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'updateSubscriptionQuotas',
          tenantId: managingQuotaTenantId,
          quotas
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      alert('Subscription updated!')
      setManagingQuotaTenantId(null)
    } catch (e: any) {
      alert(e?.message || 'Failed to save subscription')
    } finally {
      setSavingQuotas(false)
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
      setEditingTenantName(data.name || '')
      setEditingAppName(data.app_name || data.name || '')
    } catch (e: any) {
      alert(e?.message || 'Failed to load icons')
    }
  }

  async function handleSaveAppName() {
    if (!managingIconsTenantId) return
    
    try {
      setSavingAppName(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      
      const res = await fetch(`${base}/api/tenant-icons`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: managingIconsTenantId,
          app_name: editingAppName.trim() || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save app name')
      }

      alert('App name saved successfully!')
      await loadData()
      await openManageIcons({ id: managingIconsTenantId } as Tenant)
    } catch (e: any) {
      alert(e?.message || 'Failed to save app name')
    } finally {
      setSavingAppName(false)
    }
  }

  async function handleSaveTenantName() {
    if (!managingIconsTenantId) return
    try {
      setSavingTenantName(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'updateTenantName', tenantId: managingIconsTenantId, name: editingTenantName }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to save') }
      await loadData()
      await openManageIcons({ id: managingIconsTenantId } as Tenant)
    } catch (e: any) {
      alert(e?.message || 'Failed to save tenant name')
    } finally {
      setSavingTenantName(false)
    }
  }

  async function handleIconUpload(iconType: '192' | '512' | 'favicon', file: File) {
    if (!managingIconsTenantId) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB')
      return
    }

    setUploadingIcon(true)
    try {
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

  if (loading) return <div className="card page-wide"><p>{t('loading')}</p></div>

  if (error) return (
    <div className="card page-normal">
      <h3 style={{ color: 'var(--color-error)' }}>{t('error')}</h3>
      <p>{error}</p>
    </div>
  )

  const CONTROL_H = 44

  return (
    <div className="page-wide">
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t('superAdmin.title')}</h2>
        <p className="helper" style={{ marginTop: 8 }}>Manage tenants and users across the platform</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={activeTab === 'tenants' ? 'primary' : ''}
          onClick={() => setActiveTab('tenants')}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          {t('superAdmin.tabTenants')} ({tenants.length})
        </button>
        <button
          className={activeTab === 'users' ? 'primary' : ''}
          onClick={() => setActiveTab('users')}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          {t('superAdmin.tabUsers')} ({users.length})
        </button>
        <button
          className={activeTab === 'webhooks' ? 'primary' : ''}
          onClick={() => {
            setActiveTab('webhooks')
            if (!webhookEvents.length) loadWebhookEvents(0, webhookFilterTenantId, webhookFilterProvider, webhookFilterProcessed)
          }}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          Webhooks
        </button>
        <button
          className={activeTab === 'business-types' ? 'primary' : ''}
          onClick={() => setActiveTab('business-types')}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          Business Types
        </button>
      </div>

      {/* Tenants Tab */}
      {activeTab === 'tenants' && (
        <>
          {/* Create Tenant Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3>{t('superAdmin.createTenant')}</h3>
            <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
              <div>
                <label>{t('superAdmin.tenantName')}</label>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  style={{ height: CONTROL_H }}
                />
              </div>
              <div>
                <label>{t('superAdmin.businessType')}</label>
                <select
                  value={newTenantBusinessType}
                  onChange={(e) => setNewTenantBusinessType(e.target.value)}
                  style={{ height: CONTROL_H }}
                >
                  {businessTypes.filter(bt => bt.is_active).map(bt => (
                    <option key={bt.id} value={bt.id}>{bt.label}</option>
                  ))}
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
                {creatingTenant ? t('superAdmin.creating') : t('superAdmin.createTenant')}
              </button>
            </div>
          </div>

          {/* Tenants List */}
          <div className="card">
            <h3>Existing Tenants</h3>
            {tenants.length === 0 ? (
              <p className="helper">{t('superAdmin.noTenants')}</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                {tenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                      <div className="helper" style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {editingTenantBtId === tenant.id ? (
                          <>
                            <select
                              value={editingTenantBtValue}
                              onChange={e => setEditingTenantBtValue(e.target.value)}
                              style={{ height: 28, fontSize: 12, padding: '0 8px' }}
                            >
                              {businessTypes.filter(bt => bt.is_active).map(bt => (
                                <option key={bt.id} value={bt.id}>{bt.label}</option>
                              ))}
                            </select>
                            <button onClick={() => handleSaveTenantBusinessType(tenant.id)} disabled={savingTenantBt} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>
                              {savingTenantBt ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingTenantBtId(null)} style={{ height: 28, padding: '0 10px', fontSize: 12 }}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            Type: {businessTypes.find(bt => bt.id === tenant.business_type)?.label ?? tenant.business_type}
                            <button
                              onClick={() => { setEditingTenantBtId(tenant.id); setEditingTenantBtValue(tenant.business_type) }}
                              style={{ height: 20, padding: '0 8px', fontSize: 11, marginLeft: 4 }}
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                      <div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
  Features: {tenant.features?.length || 0} enabled
</div>
<div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
  Stripe: {tenant.stripe_customer_id
    ? <span style={{ color: '#4CAF50' }}>{tenant.stripe_customer_id}</span>
    : <span style={{ color: 'var(--color-error)' }}>Not set</span>
  }
</div>
<div className="helper" style={{ fontSize: 12, marginTop: 2 }}>
  Geo: {tenant.default_language || 'en'} / {tenant.default_currency || 'USD'} / {tenant.default_timezone || 'UTC'}
</div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                      <button
                        onClick={() => openManageSubscription(tenant)}
                        style={{ height: 36, padding: '0 16px', fontSize: 13 }}
                      >
                        Subscription
                      </button>
  <button
    onClick={() => openManageStripe(tenant)}
    style={{ height: 36, padding: '0 16px', fontSize: 13 }}
  >
    {t('superAdmin.stripe')}
  </button>
  <button
    onClick={() => openManageTenantFeatures(tenant)}
                        style={{
                          height: 36,
                          padding: '0 16px',
                          fontSize: 13,
                        }}
                      >
                        {t('superAdmin.features')}
                      </button>
                      <button
                        onClick={() => openManageIcons(tenant)}
                        style={{ height: 36, padding: '0 16px', fontSize: 13 }}
                      >
                        Icons
                      </button>
                      <button
                        onClick={() => openManageGeo(tenant)}
                        style={{ height: 36, padding: '0 16px', fontSize: 13 }}
                      >
                        {t('superAdmin.geo')}
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
                <label>{t('createUser.emailRequired')}</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{ height: CONTROL_H }}
                />
              </div>
              <div>
                <label>{t('createUser.nameOptional')}</label>
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
                <label>{t('createUser.passwordRequired')}</label>
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
                  {t('superAdmin.addTenantRow')}
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
                      <option value="">{t('superAdmin.addMembershipPlaceholder')}</option>
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
                      <option value="tenant_user">{t('userRole')}</option>
                      <option value="tenant_admin">{t('admin')}</option>
                    </select>
                    {newUserMemberships.length > 1 && (
                      <button
                        onClick={() => removeMembership(index)}
                        style={{
                          height: CONTROL_H,
                          width: CONTROL_H,
                          padding: 0,
                          backgroundColor: 'var(--color-error)',
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
                {creatingUser ? t('createUser.creatingText') : t('createUser.createButton')}
              </button>
            </div>
          </div>

          {/* Users List */}
          <div className="card">
            <h3>Existing Users</h3>
            {users.length === 0 ? (
              <p className="helper">{t('superAdmin.noUsers')}</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                {users.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                      opacity: user.active ? 1 : 0.5,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{user.email}</div>
                      {user.name && (
                        <div style={{ marginTop: 4 }}>{user.name}</div>
                      )}
                      {!user.active && (
                        <div style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 2 }}>
                          {t('inactive')}
                        </div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        {user.tenants && user.tenants.length > 0 ? (
                          user.tenants.map((tm, idx) => (
                            <div key={idx} className="helper" style={{ fontSize: 12, marginTop: 2 }}>
                              • {tm.tenant_name} ({tm.role})
                            </div>
                          ))
                        ) : (
                          <div className="helper" style={{ fontSize: 12, color: 'var(--color-error)' }}>
                            No tenant access
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                      <button
                        onClick={() => handleToggleUserStatus(user.id, user.active ?? true)}
                        disabled={togglingUserId === user.id}
                        style={{
                          height: 36,
                          padding: '0 12px',
                          fontSize: 13,
                          background: user.active ? '#4CAF50' : '#ff6b6b',
                          border: user.active ? '1px solid #4CAF50' : '1px solid #ff6b6b',
                          color: 'white',
                        }}
                      >
                        {togglingUserId === user.id ? '...' : (user.active ? t('active') : t('inactive'))}
                      </button>
                      <button
                        onClick={() => setManagingUserId(user.id)}
                        style={{ height: 36, padding: '0 16px', fontSize: 13 }}
                      >
                        {t('superAdmin.manage')}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteUser(user)}
                        disabled={deletingUserId === user.id}
                        style={{ height: 36, padding: '0 16px', fontSize: 13, background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' }}
                      >
                        {deletingUserId === user.id ? '...' : t('delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Webhook Event Log</h3>
          <p className="helper" style={{ marginTop: 4, marginBottom: 16 }}>
            Raw inbound events from booking providers. Stored in <code>webhook_events</code>.
          </p>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <select
              value={webhookFilterProcessed}
              onChange={e => setWebhookFilterProcessed(e.target.value)}
              style={{ height: CONTROL_H, minWidth: 140 }}
            >
              <option value="">All statuses</option>
              <option value="false">Unprocessed</option>
              <option value="true">Processed</option>
            </select>
            <select
              value={webhookFilterProvider}
              onChange={e => setWebhookFilterProvider(e.target.value)}
              style={{ height: CONTROL_H, minWidth: 140 }}
            >
              <option value="">All providers</option>
              <option value="simplybook">SimplyBook</option>
              <option value="twilio">Twilio</option>
            </select>
            <input
              type="text"
              placeholder="Tenant ID (UUID)"
              value={webhookFilterTenantId}
              onChange={e => setWebhookFilterTenantId(e.target.value)}
              style={{ height: CONTROL_H, minWidth: 260 }}
            />
            <button
              className="primary"
              style={{ height: CONTROL_H }}
              onClick={() => loadWebhookEvents(0, webhookFilterTenantId, webhookFilterProvider, webhookFilterProcessed)}
              disabled={webhookLoading}
            >
              {webhookLoading ? 'Loading…' : 'Search'}
            </button>
          </div>

          {webhookError && <p style={{ color: 'var(--color-error)' }}>{webhookError}</p>}

          {!webhookLoading && webhookEvents.length === 0 && (
            <p className="helper">No webhook events found.</p>
          )}

          {webhookEvents.length > 0 && (
            <>
              <p className="helper" style={{ marginBottom: 8 }}>
                Showing {webhookOffset + 1}–{Math.min(webhookOffset + webhookEvents.length, webhookTotal)} of {webhookTotal}
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Time</th>
                      <th style={{ padding: '6px 8px' }}>Tenant</th>
                      <th style={{ padding: '6px 8px' }}>Provider</th>
                      <th style={{ padding: '6px 8px' }}>Event Type</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                      <th style={{ padding: '6px 8px' }}>Error</th>
                      <th style={{ padding: '6px 8px' }}>Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookEvents.map(ev => (
                      <>
                        <tr
                          key={ev.id}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => setWebhookExpandedId(webhookExpandedId === ev.id ? null : ev.id)}
                        >
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>
                            {new Date(ev.created_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 12 }}>
                            {ev.tenant_name || ev.tenant_id?.slice(0, 8) || '—'}
                          </td>
                          <td style={{ padding: '6px 8px' }}>{ev.provider}</td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{ev.event_type}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: ev.processed ? 'rgba(34,197,94,0.15)' : ev.processing_error ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                              color: ev.processed ? '#22c55e' : ev.processing_error ? '#ef4444' : '#ca8a04',
                            }}>
                              {ev.processed ? 'processed' : ev.processing_error ? 'error' : 'pending'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--color-error)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.processing_error || ''}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <button
                              style={{ fontSize: 11, padding: '2px 8px', height: 'auto' }}
                              onClick={e => { e.stopPropagation(); setWebhookExpandedId(webhookExpandedId === ev.id ? null : ev.id) }}
                            >
                              {webhookExpandedId === ev.id ? 'hide' : 'show'}
                            </button>
                          </td>
                        </tr>
                        {webhookExpandedId === ev.id && (
                          <tr key={`${ev.id}-payload`} style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <td colSpan={7} style={{ padding: '12px 8px' }}>
                              <pre style={{ margin: 0, fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 400 }}>
                                {JSON.stringify(ev.payload, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
                <button
                  disabled={webhookOffset === 0 || webhookLoading}
                  onClick={() => loadWebhookEvents(Math.max(0, webhookOffset - 50), webhookFilterTenantId, webhookFilterProvider, webhookFilterProcessed)}
                  style={{ height: CONTROL_H }}
                >
                  Previous
                </button>
                <button
                  disabled={webhookOffset + webhookEvents.length >= webhookTotal || webhookLoading}
                  onClick={() => loadWebhookEvents(webhookOffset + 50, webhookFilterTenantId, webhookFilterProvider, webhookFilterProcessed)}
                  style={{ height: CONTROL_H }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Business Types Tab */}
      {activeTab === 'business-types' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Business Types</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={btActiveTab === 'list' ? 'primary' : ''} onClick={() => setBtActiveTab('list')} style={{ height: 32, padding: '0 14px', fontSize: 13 }}>List</button>
              <button className={btActiveTab === 'new' ? 'primary' : ''} onClick={() => setBtActiveTab('new')} style={{ height: 32, padding: '0 14px', fontSize: 13 }}>+ New</button>
            </div>
          </div>

          {btActiveTab === 'new' && (
            <div style={{ padding: '12px 0 20px', borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
              <div className="row row-2col-mobile" style={{ marginBottom: 12 }}>
                <div>
                  <label>ID (snake_case, permanent)</label>
                  <input value={newBtId} onChange={e => setNewBtId(e.target.value)} placeholder="e.g. fitness_studio" style={{ height: CONTROL_H }} />
                </div>
                <div>
                  <label>Label (shown in UI)</label>
                  <input value={newBtLabel} onChange={e => setNewBtLabel(e.target.value)} placeholder="e.g. Fitness Studio" style={{ height: CONTROL_H }} />
                </div>
              </div>
              <button className="primary" onClick={handleCreateBusinessType} disabled={creatingBt || !newBtId.trim() || !newBtLabel.trim()} style={{ height: CONTROL_H }}>
                {creatingBt ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}

          {btActiveTab === 'list' && (
            <div>
              {businessTypes.length === 0 ? (
                <p className="helper">No business types found. Run the SQL migration first.</p>
              ) : businessTypes.map(bt => (
                <div key={bt.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                  {editingBtId === bt.id ? (
                    <div>
                      <div className="row row-2col-mobile" style={{ marginBottom: 8 }}>
                        <div>
                          <label>Label</label>
                          <input value={editingBtLabel} onChange={e => setEditingBtLabel(e.target.value)} style={{ height: 36 }} />
                        </div>
                        <div>
                          <label>ID (read-only)</label>
                          <input value={bt.id} readOnly style={{ height: 36, opacity: 0.5 }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label>config_defaults (JSON)</label>
                        <textarea
                          value={editingBtConfig}
                          onChange={e => { setEditingBtConfig(e.target.value); setBtConfigError(null) }}
                          style={{ width: '100%', height: 240, minHeight: 240, fontFamily: 'monospace', fontSize: 12, resize: 'vertical', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
                          placeholder='{"labels":{"directLabel":"Direct"}}'
                        />
                        {btConfigError && <p style={{ color: 'var(--color-error)', fontSize: 12, margin: '4px 0 0' }}>{btConfigError}</p>}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Page configurations</div>
                        {[
                          { id: 'new-product', label: t('products', { ns: 'navigation' }), file: 'NewProduct.tsx', route: '/products/new' },
                          { id: 'edit-product', label: `${t('products.editProductTitle')} / Service`, file: 'EditProduct.tsx', route: '/products/edit' },
                        ].map(page => (
                          <div key={page.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}>
                            <div>
                              <span style={{ fontWeight: 500, fontSize: 13 }}>{page.label}</span>
                            </div>
                            <button
                              onClick={() => {
                                const existing = (bt.config_defaults as any)?.pages?.[page.id]?.fields ?? {}
                                const baseDefaults = page.id === 'new-product'
                                  ? { product_category: true, product_subcategory: true, sku: true, variant: true, show_product_tab: true, show_service_tab: true }
                                  : { product_category: true, product_subcategory: true, sku: true, variant: true }
                                const merged = { ...baseDefaults, ...existing }
                                setBtFieldConfig(merged)
                                if (page.id === 'edit-product') {
                                  const svcExisting = (bt.config_defaults as any)?.pages?.['edit-service']?.fields ?? {}
                                  setBtFieldConfigService({ product_category: true, product_subcategory: true, ...svcExisting })
                                  setBtPreviewTab('product')
                                } else {
                                  setBtPreviewTab(merged.show_product_tab !== false ? 'product' : 'service')
                                }
                                setBtPageConfig({ btId: bt.id, pageId: page.id })
                              }}
                              style={{ height: 28, padding: '0 12px', fontSize: 12 }}
                            >
                              Configure
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Theme</div>
                        <div style={{ padding: '10px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 12 }}>Default skin</label>
                            <div style={{ display: 'flex', gap: 0, marginTop: 4, border: '1px solid var(--border, #e6e6e6)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
                              {(['default', 'vintage', 'pool'] as const).map(skin => (
                                <button key={skin} onClick={() => setBtThemeDefaultSkin(skin)} style={{
                                  padding: '5px 16px', border: 'none', borderRadius: 0, height: 28, fontSize: 12,
                                  background: btThemeDefaultSkin === skin ? 'var(--primary, #2563eb)' : 'transparent',
                                  color: btThemeDefaultSkin === skin ? '#fff' : 'inherit',
                                  cursor: 'pointer', fontWeight: btThemeDefaultSkin === skin ? 600 : 400,
                                }}>
                                  {skin === 'default' ? 'Default' : skin === 'vintage' ? 'Vintage' : 'Aqua'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 12 }}>Default mode</label>
                            <div style={{ display: 'flex', gap: 0, marginTop: 4, border: '1px solid var(--border, #e6e6e6)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
                              {(['dark', 'light'] as const).map(m => (
                                <button key={m} onClick={() => setBtThemeDefaultMode(m)} style={{
                                  padding: '5px 16px', border: 'none', borderRadius: 0, height: 28, fontSize: 12,
                                  background: btThemeDefaultMode === m ? 'var(--primary, #2563eb)' : 'transparent',
                                  color: btThemeDefaultMode === m ? '#fff' : 'inherit',
                                  cursor: 'pointer', fontWeight: btThemeDefaultMode === m ? 600 : 400,
                                }}>
                                  {m === 'dark' ? 'Dark' : 'Light'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 12 }}>Selectable skins (tenant/user can choose between these)</label>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {(['default', 'vintage', 'pool'] as const).map(skin => {
                                const active = btThemeSelectableSkins.includes(skin)
                                return (
                                  <button key={skin} onClick={() => {
                                    setBtThemeSelectableSkins(prev => {
                                      if (prev.includes(skin)) return prev.length === 1 ? prev : prev.filter(s => s !== skin)
                                      return [...prev, skin]
                                    })
                                  }} style={{
                                    padding: '5px 16px', height: 28, fontSize: 12, borderRadius: 6,
                                    border: active ? '1px solid var(--color-success)' : '1px solid var(--border)',
                                    background: active ? 'rgba(34,197,94,0.12)' : 'transparent',
                                    color: 'inherit', cursor: 'pointer', fontWeight: active ? 600 : 400,
                                  }}>
                                    {active ? '✓ ' : ''}{skin === 'default' ? 'Default' : skin === 'vintage' ? 'Vintage' : 'Aqua'}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 12 }}>Selectable modes (tenant/user can choose between these)</label>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {(['dark', 'light'] as const).map(m => {
                                const active = btThemeSelectableModes.includes(m)
                                return (
                                  <button key={m} onClick={() => {
                                    setBtThemeSelectableModes(prev => {
                                      if (prev.includes(m)) return prev.length === 1 ? prev : prev.filter(x => x !== m)
                                      return [...prev, m]
                                    })
                                  }} style={{
                                    padding: '5px 16px', height: 28, fontSize: 12, borderRadius: 6,
                                    border: active ? '1px solid var(--color-success)' : '1px solid var(--border)',
                                    background: active ? 'rgba(34,197,94,0.12)' : 'transparent',
                                    color: 'inherit', cursor: 'pointer', fontWeight: active ? 600 : 400,
                                  }}>
                                    {active ? '✓ ' : ''}{m === 'dark' ? 'Dark' : 'Light'}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <button
                            onClick={() => handleSaveBtThemeConfig(bt)}
                            disabled={savingBtTheme}
                            style={{ height: 28, padding: '0 12px', fontSize: 12 }}
                          >
                            {savingBtTheme ? 'Saving…' : 'Save theme'}
                          </button>
                        </div>
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Front page</div>
                        <div style={{ padding: '10px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
                          <label style={{ fontSize: 12 }}>Shown once per login, before the dashboard. No selection = no front page.</label>
                          <select
                            value={btFrontPageKey}
                            onChange={e => setBtFrontPageKey(e.target.value)}
                            style={{ display: 'block', fontSize: 13, padding: '5px 8px', marginTop: 6, marginBottom: 10, width: '100%', maxWidth: 280 }}
                          >
                            <option value="">None</option>
                            {FRONT_PAGES.map(fp => (
                              <option key={fp.key} value={fp.key}>{fp.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleSaveBtFrontPage(bt)}
                            disabled={savingBtFrontPage}
                            style={{ height: 28, padding: '0 12px', fontSize: 12 }}
                          >
                            {savingBtFrontPage ? 'Saving…' : 'Save front page'}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="primary" onClick={handleSaveBusinessType} disabled={savingBt} style={{ height: 32, padding: '0 14px', fontSize: 13 }}>{savingBt ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => { setEditingBtId(null); setBtConfigError(null) }} style={{ height: 32, padding: '0 14px', fontSize: 13 }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{bt.label} <span className="helper" style={{ fontWeight: 400 }}>({bt.id})</span></div>
                        <div className="helper" style={{ marginTop: 2 }}>
                          {bt.is_active ? <span style={{ color: 'var(--color-success)' }}>Active</span> : <span style={{ color: 'var(--color-error)' }}>Inactive</span>}
                          {' · '}config_defaults: {Object.keys(bt.config_defaults).length === 0 ? 'empty' : JSON.stringify(bt.config_defaults).slice(0, 60) + '…'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            setEditingBtId(bt.id)
                            setEditingBtLabel(bt.label)
                            setEditingBtConfig(Object.keys(bt.config_defaults).length ? JSON.stringify(bt.config_defaults, null, 2) : '')
                            const themeDefaults = (bt.config_defaults as any)?.theme ?? {}
                            const defaultSkin = themeDefaults.defaultSkin === 'vintage' ? 'vintage' : themeDefaults.defaultSkin === 'pool' ? 'pool' : 'default'
                            const defaultMode = themeDefaults.defaultMode === 'light' ? 'light' : 'dark'
                            setBtThemeDefaultSkin(defaultSkin)
                            setBtThemeDefaultMode(defaultMode)
                            // Back-compat: older saves used a boolean `selectable` flag instead of arrays
                            setBtThemeSelectableSkins(
                              Array.isArray(themeDefaults.selectableSkins) ? themeDefaults.selectableSkins
                                : themeDefaults.selectable === false ? [defaultSkin] : ['default', 'vintage']
                            )
                            setBtThemeSelectableModes(
                              Array.isArray(themeDefaults.selectableModes) ? themeDefaults.selectableModes : ['dark', 'light']
                            )
                            setBtFrontPageKey((bt.config_defaults as any)?.frontPageKey ?? '')
                          }}
                          style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                        >
                          Edit
                        </button>
                        {bt.id !== 'general' && (
                          <button onClick={() => handleToggleBusinessType(bt.id, bt.is_active)} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>
                            {bt.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Business type page config overlay */}
      {btPageConfig && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setBtPageConfig(null)}
        >
          <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {businessTypes.find(bt => bt.id === btPageConfig.btId)?.label} · Page config
                </div>
                <div className="helper" style={{ marginTop: 2 }}>
                  {btPageConfig.pageId === 'new-product' ? t('products', { ns: 'navigation' }) : btPageConfig.pageId === 'edit-product' ? `${t('products.editProductTitle')} / Service` : btPageConfig.pageId}
                </div>
              </div>
              <button onClick={() => setBtPageConfig(null)} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>Close</button>
            </div>
            {/* Preview */}
            <div style={{ background: 'var(--bg, #f9fafb)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
              {btPageConfig.pageId === 'edit-product' ? (
                /* Edit Product / Service — toggle switches between independent configs */
                <>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                    {btPreviewTab === 'service' ? 'Edit Service' : t('products.editProductTitle')}
                  </div>

                  {/* Toggle — switches which config is being edited */}
                  <div style={{ display: 'flex', gap: 0, marginBottom: 12, width: 'fit-content' }}>
                    {(['product', 'service'] as const).map((tab, i) => (
                      <button key={tab} onClick={() => setBtPreviewTab(tab)} style={{
                        padding: '6px 16px',
                        border: '1px solid var(--border)',
                        borderRight: i === 0 ? 'none' : undefined,
                        borderRadius: i === 0 ? '6px 0 0 6px' : '0 6px 6px 0',
                        background: btPreviewTab === tab ? 'var(--primary)' : 'transparent',
                        color: btPreviewTab === tab ? '#fff' : 'inherit',
                        fontSize: 13, cursor: 'pointer',
                      }}>
                        {tab === 'product' ? 'Product' : 'Service'}
                      </button>
                    ))}
                  </div>

                  {/* Non-configurable: selector + name */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Select {btPreviewTab === 'service' ? 'service' : 'product'}</div>
                    <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {btPreviewTab === 'service' ? t('products.serviceName') : t('products.productName')}
                    </div>
                    <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                  </div>

                  {/* Configurable: category + subcategory — independent per tab */}
                  {(() => {
                    const cfg = btPreviewTab === 'service' ? btFieldConfigService : btFieldConfig
                    const setCfg = btPreviewTab === 'service' ? setBtFieldConfigService : setBtFieldConfig
                    const showCat = cfg.product_category    !== false
                    const showSub = cfg.product_subcategory !== false
                    const catLabel = btPreviewTab === 'service' ? 'Service category' : 'Product category'
                    const subLabel = btPreviewTab === 'service' ? 'Service subcategory' : 'Product subcategory'
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div style={{ position: 'relative', opacity: showCat ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{catLabel}</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showCat ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => setCfg(prev => ({ ...prev, product_category: !showCat }))} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showCat ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <div style={{ position: 'relative', opacity: showSub ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{subLabel}</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showSub ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => setCfg(prev => ({ ...prev, product_subcategory: !showSub }))} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showSub ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Configurable: SKU + Variant — product only */}
                  {btPreviewTab === 'product' && (() => {
                    const showSku     = btFieldConfig.sku     !== false
                    const showVariant = btFieldConfig.variant !== false
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div style={{ position: 'relative', opacity: showSku ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Item ID / SKU</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showSku ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => setBtFieldConfig(prev => ({ ...prev, sku: !showSku }))} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showSku ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <div style={{ position: 'relative', opacity: showVariant ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Variant</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showVariant ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => setBtFieldConfig(prev => ({ ...prev, variant: !showVariant }))} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showVariant ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Non-configurable: cost fields */}
                  {btPreviewTab === 'product' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[t('products.servicePrice'), t('products.productCostUSD')].map(label => (
                        <div key={label}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {[t('products.duration'), t('products.servicePrice')].map(label => (
                          <div key={label}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                            <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('products.directServiceCost')}</div>
                        <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8, opacity: 0.4 }}>
                    <div style={{ height: 36, width: 80, background: 'var(--primary)', borderRadius: 6 }} />
                    <div style={{ height: 36, width: 60, background: 'var(--border)', borderRadius: 6 }} />
                  </div>
                </>
              ) : (
                /* new-product preview */
                <>
                  {/* Non-configurable: title + edit button */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {btPreviewTab === 'service' ? t('products.newServiceTitle') : t('products.newProductTitle')}
                    </div>
                    <div style={{ height: 28, width: 90, background: 'var(--primary)', borderRadius: 4, opacity: 0.4 }} />
                  </div>

                  {/* Configurable: Product / Service tab toggle */}
                  <div style={{ display: 'flex', gap: 0, marginBottom: 12, width: 'fit-content' }}>
                    {(['product', 'service'] as const).map((tab, i) => {
                      const configKey = tab === 'product' ? 'show_product_tab' : 'show_service_tab'
                      const isVisible = btFieldConfig[configKey] !== false
                      const isActive = btPreviewTab === tab
                      return (
                        <div key={tab} style={{ position: 'relative' }}>
                          <button
                            onClick={() => setBtPreviewTab(tab)}
                            style={{
                              padding: '6px 28px 6px 12px',
                              border: `1px solid ${isVisible ? 'var(--color-success, #22c55e)' : 'var(--border)'}`,
                              borderRight: i === 0 ? 'none' : undefined,
                              borderRadius: i === 0 ? '6px 0 0 6px' : '0 6px 6px 0',
                              background: isActive ? 'var(--primary)' : 'transparent',
                              color: isActive ? '#fff' : 'inherit',
                              fontSize: 13,
                              cursor: 'pointer',
                              opacity: isVisible ? 1 : 0.35,
                            }}
                          >
                            {tab === 'product' ? 'Product' : 'Service'}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setBtFieldConfig(prev => ({ ...prev, [configKey]: !isVisible })) }}
                            style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 4px', fontSize: 9, borderRadius: 4 }}
                          >
                            {isVisible ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Non-configurable: name */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {btPreviewTab === 'service' ? t('products.serviceName') : t('products.productName')}
                    </div>
                    <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6 }} />
                  </div>

                  {/* Configurable: category + subcategory */}
                  {(() => {
                    const showCat = btFieldConfig.product_category !== false
                    const showSub = btFieldConfig.product_subcategory !== false
                    const toggle = (key: string, val: boolean) => setBtFieldConfig(prev => ({ ...prev, [key]: val }))
                    const catLabel = btPreviewTab === 'service' ? 'Service category' : 'Product category'
                    const subLabel = btPreviewTab === 'service' ? 'Service subcategory' : 'Product subcategory'
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div style={{ position: 'relative', opacity: showCat ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{catLabel}</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showCat ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => toggle('product_category', !showCat)} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showCat ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <div style={{ position: 'relative', opacity: showSub ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{subLabel}</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showSub ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => toggle('product_subcategory', !showSub)} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showSub ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Configurable: SKU + Variant (product tab only) */}
                  {btPreviewTab === 'product' && (() => {
                    const showSku     = btFieldConfig.sku     !== false
                    const showVariant = btFieldConfig.variant !== false
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div style={{ position: 'relative', opacity: showSku ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Item ID / SKU</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showSku ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => setBtFieldConfig(prev => ({ ...prev, sku: !showSku }))} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showSku ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <div style={{ position: 'relative', opacity: showVariant ? 1 : 0.35 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Variant</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: `1px solid ${showVariant ? 'var(--color-success, #22c55e)' : 'var(--border)'}`, borderRadius: 6 }} />
                          <button onClick={() => setBtFieldConfig(prev => ({ ...prev, variant: !showVariant }))} style={{ position: 'absolute', top: 0, right: 0, height: 20, padding: '0 6px', fontSize: 10, borderRadius: 4 }}>
                            {showVariant ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Non-configurable: price/cost fields (layout differs per tab) */}
                  {btPreviewTab === 'product' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[t('products.servicePrice'), t('products.productCostUSD')].map(label => (
                        <div key={label}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                          <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {[t('products.duration'), t('products.servicePrice')].map(label => (
                          <div key={label}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                            <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('products.directServiceCost')}</div>
                        <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }} />
                      </div>
                    </>
                  )}

                  {/* Non-configurable: image + buttons */}
                  <div style={{ height: 36, background: 'var(--input-bg, #fff)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.4, marginBottom: 12 }} />
                  <div style={{ display: 'flex', gap: 8, opacity: 0.4 }}>
                    <div style={{ height: 36, width: 80, background: 'var(--primary)', borderRadius: 6 }} />
                    <div style={{ height: 36, width: 60, background: 'var(--border)', borderRadius: 6 }} />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="primary" onClick={handleSaveBtPageConfig} disabled={savingBtPageConfig} style={{ height: 34, padding: '0 16px', fontSize: 13 }}>
                {savingBtPageConfig ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setBtPageConfig(null)} style={{ height: 34, padding: '0 16px', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {confirmDeleteUser && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setConfirmDeleteUser(null)}
        >
          <div className="card" style={{ maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Delete user?</h3>
            <p style={{ margin: '0 0 4px', fontSize: 14 }}>
              <strong>{confirmDeleteUser.email}</strong>
              {confirmDeleteUser.name && <span style={{ color: 'var(--text-secondary)' }}> ({confirmDeleteUser.name})</span>}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This removes the login and all tenant access for this user. No orders, payments, or other business data will be affected.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteUser(null)} style={{ height: 36, padding: '0 16px', fontSize: 14 }}>
                {t('cancel')}
              </button>
              <button
                onClick={() => handleDeleteUser(confirmDeleteUser)}
                className="primary"
                style={{ height: 36, padding: '0 16px', fontSize: 14, background: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
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
            background: 'var(--backdrop)',
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
            <h3 style={{ marginTop: 0 }}>{t('superAdmin.tenantFeatures', { name: managingTenantName })}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Select which features this tenant has access to
            </p>

            <div style={{ marginTop: 20 }}>
              {MODULES.map((mod) => {
                const alwaysIncluded = mod.alwaysIncluded
                const fullyChecked = alwaysIncluded || isTenantModuleFullyChecked(mod.features)
                const partiallyChecked = !alwaysIncluded && isTenantModulePartiallyChecked(mod.features)
                return (
                  <div key={mod.id} style={{ marginBottom: 24 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: alwaysIncluded ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={fullyChecked}
                        disabled={alwaysIncluded}
                        ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = partiallyChecked }}
                        onChange={() => !alwaysIncluded && toggleTenantModule(mod.features)}
                        style={{ width: 20, height: 20 }}
                      />
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                        {mod.name}
                        {alwaysIncluded && (
                          <span className="helper" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>Always included</span>
                        )}
                        {mod.features.length === 0 && (
                          <span className="helper" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>No pages yet</span>
                        )}
                      </span>
                    </label>
                    {mod.features.length > 0 && (
                      <div style={{ display: 'grid', gap: 8, paddingLeft: 32 }}>
                        {mod.features.map((featureId) => {
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
                                cursor: alwaysIncluded ? 'default' : 'pointer',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={alwaysIncluded || managingTenantFeatures.includes(featureId)}
                                disabled={alwaysIncluded}
                                onChange={() => !alwaysIncluded && toggleFeature(featureId)}
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
                    )}
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
                {savingFeatures ? t('superAdmin.saving') : t('save')}
              </button>
              <button
                onClick={() => setManagingTenantId(null)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {t('cancel')}
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
            background: 'var(--backdrop)',
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
            <h3 style={{ marginTop: 0 }}>Manage Branding: {managingIconsTenant.name}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Customize app name and icons for this tenant
            </p>

            {/* Tenant Name Section */}
            <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Tenant Name</div>
              <div className="helper" style={{ fontSize: 12, marginBottom: 12 }}>
                The tenant's account name — shown in the welcome message and throughout the app
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={editingTenantName}
                  onChange={(e) => setEditingTenantName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  style={{ flex: 1, height: 44 }}
                />
                <button
                  onClick={handleSaveTenantName}
                  disabled={savingTenantName || !editingTenantName.trim() || editingTenantName.trim() === managingIconsTenant.name}
                  className="primary"
                  style={{ height: 44, padding: '0 20px', fontSize: 14 }}
                >
                  {savingTenantName ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* App Name Section */}
            <div style={{
              marginTop: 24,
              padding: 16,
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>App Name</div>
              <div className="helper" style={{ fontSize: 12, marginBottom: 12 }}>
                This name appears in the browser tab and when installed as a PWA
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={editingAppName}
                  onChange={(e) => setEditingAppName(e.target.value)}
                  placeholder="Enter app name (e.g., Acme App)"
                  style={{ flex: 1, height: 44 }}
                />
                <button
                  onClick={handleSaveAppName}
                  disabled={savingAppName || editingAppName.trim() === (managingIconsTenant.app_name || managingIconsTenant.name || '')}
                  className="primary"
                  style={{
                    height: 44,
                    padding: '0 20px',
                    fontSize: 14,
                  }}
                >
                  {savingAppName ? 'Saving...' : 'Save'}
                </button>
              </div>
              {managingIconsTenant.app_name && (
                <div className="helper" style={{ fontSize: 12, marginTop: 8 }}>
                  Current: {managingIconsTenant.app_name}
                </div>
              )}
            </div>

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
                                  handleIconUpload(type as any, file)
                                }
                                e.target.value = ''
                              }}
                              disabled={uploadingIcon}
                              style={{ display: 'none' }}
                            />
                            <button
                              onClick={() => document.getElementById(`replace-${type}`)?.click()}
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
                              color: 'var(--color-error)',
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
                            handleIconUpload(type as any, file)
                          }
                          e.target.value = ''
                        }}
                        disabled={uploadingIcon}
                        style={{ display: 'none' }}
                      />
                      <button
                        onClick={() => document.getElementById(`upload-${type}`)?.click()}
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
      {/* Subscription Quota Modal */}
      {managingQuotaTenantId && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'var(--backdrop)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
          }}
          onClick={() => setManagingQuotaTenantId(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Subscription: {managingQuotaTenantName}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Set the number of users per module. Pricing: $9.99 per user per module per month.
            </p>

            {loadingQuotas ? (
              <p className="helper" style={{ marginTop: 16 }}>{t('loading')}</p>
            ) : (
              <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
                {MODULES.filter(m => !m.alwaysIncluded).map(mod => {
                  const max = quotaValues[mod.id] ?? 0
const used = usedCounts[mod.id] || 0
const available = max - used
                  return (
                    <div
                      key={mod.id}
                      style={{
                        padding: 16,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{mod.name}</div>
                          <div className="helper" style={{ fontSize: 12, marginTop: 4, color: available < 0 ? 'var(--color-error)' : 'inherit' }}>
  Used: {used} · {available >= 0 ? `Available: ${available}` : `Over quota: ${Math.abs(available)}`}
</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ fontSize: 13 }}>Max users</label>
                          <input
                            type="number"
                            min={0}
                            value={max}
                            onChange={(e) => setQuotaValues(prev => ({
                              ...prev,
                              [mod.id]: Math.max(0, parseInt(e.target.value) || 0)
                            }))}
                            style={{ width: 70, height: CONTROL_H, textAlign: 'center' }}
                          />
                        </div>
                      </div>
                      {max > 0 && (
                        <div className="helper" style={{ fontSize: 12, marginTop: 8 }}>
                          Monthly: ${(max * mod.pricePerUser).toFixed(2)}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  Total monthly: ${
                    MODULES.filter(m => !m.alwaysIncluded)
                      .reduce((sum, mod) => sum + (quotaValues[mod.id] || 0) * mod.pricePerUser, 0)
                      .toFixed(2)
                  }
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={handleSaveSubscription}
                disabled={savingQuotas || loadingQuotas}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {savingQuotas ? t('superAdmin.saving') : t('save')}
              </button>
              <button
                onClick={() => setManagingQuotaTenantId(null)}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Stripe Customer ID Modal */}
{managingStripeId && (
  <div
    style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'var(--backdrop)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    }}
    onClick={() => setManagingStripeId(null)}
  >
    <div
      className="card"
      style={{ maxWidth: 480, width: '100%' }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{ marginTop: 0 }}>Stripe: {managingStripeName}</h3>
      <div style={{ marginTop: 16 }}>
        <label>{t('superAdmin.stripeCustomerId')}</label>
        <input
          type="text"
          value={editingStripeCustomerId}
          onChange={(e) => setEditingStripeCustomerId(e.target.value)}
          placeholder="cus_xxxxxxxxxxxxxxx"
          style={{ height: CONTROL_H, marginTop: 6, fontFamily: 'monospace' }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label>SMS Subscription Item ID</label>
        <input
          type="text"
          value={editingStripeItemId}
          onChange={(e) => setEditingStripeItemId(e.target.value)}
          placeholder="si_xxxxxxxxxxxx"
          style={{ height: CONTROL_H, marginTop: 6, fontFamily: 'monospace' }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Price per SMS</label>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={editingSmsPricePerUnit}
          onChange={(e) => setEditingSmsPricePerUnit(e.target.value)}
          placeholder="0.0300"
          style={{ height: CONTROL_H, marginTop: 6 }}
        />
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          className="primary"
          onClick={handleSaveStripeCustomerId}
          disabled={savingStripeCustomerId}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          {savingStripeCustomerId ? t('superAdmin.saving') : t('superAdmin.saveStripe')}
        </button>
        <button
          onClick={() => setManagingStripeId(null)}
          style={{ height: CONTROL_H, flex: 1 }}
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  </div>
)}

      {/* Manage Tenant Geo Modal */}
      {managingGeoTenantId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'var(--backdrop)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
          onClick={() => setManagingGeoTenantId(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{t('superAdmin.geoSettingsTitle', { name: managingGeoTenantName })}</h3>
            <p className="helper" style={{ marginTop: 8 }}>
              Set default language, currency, and timezone for this tenant.
              Users can override individually in Account Administration.
            </p>

            <div style={{ marginTop: 16 }}>
              <label>{t('superAdmin.language')}</label>
              <select
                value={editingGeoLanguage}
                onChange={(e) => setEditingGeoLanguage(e.target.value)}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="en">{t('tenantAdmin.langEnglish')}</option>
                <option value="sv">{t('tenantAdmin.langSwedish')}</option>
                <option value="es">{t('tenantAdmin.langSpanish')}</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('superAdmin.currency')}</label>
              <select
                value={editingGeoCurrency}
                onChange={(e) => setEditingGeoCurrency(e.target.value)}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="USD">USD – US Dollar</option>
                <option value="SEK">SEK – Swedish Krona</option>
                <option value="EUR">EUR – Euro</option>
                <option value="GBP">GBP – British Pound</option>
                <option value="NOK">NOK – Norwegian Krone</option>
                <option value="DKK">DKK – Danish Krone</option>
                <option value="CAD">CAD – Canadian Dollar</option>
                <option value="AUD">AUD – Australian Dollar</option>
                <option value="MXN">MXN – Mexican Peso</option>
                <option value="COP">COP – Colombian Peso</option>
                <option value="GHS">GHS – Ghanaian Cedi</option>
                <option value="BRL">BRL – Brazilian Real</option>
                <option value="JPY">JPY – Japanese Yen</option>
                <option value="CHF">CHF – Swiss Franc</option>
                <option value="SGD">SGD – Singapore Dollar</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>{t('superAdmin.timezone')}</label>
              <select
                value={editingGeoTimezone}
                onChange={(e) => setEditingGeoTimezone(e.target.value)}
                style={{ height: CONTROL_H, width: '100%', marginTop: 4 }}
              >
                <option value="UTC">UTC</option>
                <optgroup label="Americas">
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Phoenix">America/Phoenix (MT, no DST)</option>
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
                onClick={handleSaveTenantGeo}
                disabled={savingGeo}
                style={{ height: CONTROL_H, flex: 1 }}
              >
                {savingGeo ? t('superAdmin.saving') : t('superAdmin.saveGeo')}
              </button>
              <button
                onClick={() => setManagingGeoTenantId(null)}
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