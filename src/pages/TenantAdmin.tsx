// src/pages/TenantAdmin.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  const navigate = useNavigate()
  const location = useLocation()
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

  // Tab
  const [activeTab, setActiveTab] = useState<'team' | 'invoicing' | 'accounting'>('team')

  // Invoice config
  const [invoiceCfg, setInvoiceCfg] = useState({
    autoInvoiceNumber: false,
    billingCountry: '',
    companyName: '',
    companyAddress1: '',
    companyAddress2: '',
    companyPhone: '',
    contactName: '',
    enabledPaymentMethods: [] as string[],
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankRoutingNumber: '',
  })
  const [savingInvoice, setSavingInvoice] = useState(false)

  // Invoice exports
  type InvoiceRow = {
    id: string; invoice_no: string | null; invoice_date: string | Date
    due_date: string | Date | null; customer_name: string | null; total_amount: number | null
  }
  const [invYear,    setInvYear]    = useState(String(new Date().getFullYear()))
  const [invMonth,   setInvMonth]   = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [invRows,    setInvRows]    = useState<InvoiceRow[]>([])
  const [invLoading, setInvLoading] = useState(false)
  const [showInvPreview, setShowInvPreview] = useState(false)

  // Accounting — exports
  type ExportRow = {
    id: string; order_no: string | null; order_date: string | Date
    customer_name: string; order_amount: number
    partner_name: string | null; partner_amount: number
  }
  const currentYear = new Date().getFullYear()
  const [accYear,  setAccYear]  = useState(String(currentYear))
  const [accMonth, setAccMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [accRows,  setAccRows]  = useState<ExportRow[]>([])
  const [accLoading, setAccLoading] = useState(false)
  const [accSortBy,  setAccSortBy]  = useState<'order_no' | 'order_date' | 'customer_name'>('order_no')
  const [accSortDir, setAccSortDir] = useState<'asc' | 'desc'>('asc')
  const [showAccPreview, setShowAccPreview] = useState(false)

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

  useEffect(() => {
    if (activeTab === 'invoicing') loadInvoiceConfig()
  }, [activeTab])

  useEffect(() => {
    const s = location.state as any
    if (s?.openInvoiceModal) {
      setActiveTab('accounting')
      const y = s.invYear as string | undefined
      const m = s.invMonth as string | undefined
      if (y) setInvYear(y)
      if (m) setInvMonth(m)
      fetchInvoices(y, m)
    }
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
  // ── Invoice helpers ───────────────────────────────────────────────────────

  async function fetchInvoices(yearOverride?: string, monthOverride?: string) {
    const month = `${yearOverride ?? invYear}-${monthOverride ?? invMonth}`
    setInvLoading(true)
    setInvRows([])
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')
      const [y, m] = month.split('-').map(Number)
      const from = `${month}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const to = `${month}-${String(lastDay).padStart(2, '0')}`
      const res = await fetch(`${base}/api/invoices?from=${from}&to=${to}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
        },
      })
      if (!res.ok) throw new Error('Fetch failed')
      const data = await res.json()
      setInvRows(data)
      setShowInvPreview(true)
    } catch (e: any) {
      alert(e?.message || 'Failed to fetch invoices')
    } finally {
      setInvLoading(false)
    }
  }

  function exportInvoiceCSV(rows: InvoiceRow[]) {
    const headers = [
      t('tenantAdmin.colCustomer'), t('tenantAdmin.colInvoiceNo'),
      t('tenantAdmin.colInvoiceDate'), t('tenantAdmin.colDueDate'), t('tenantAdmin.colTotal'),
    ]
    const lines = [
      headers.join(','),
      ...rows.map(r => [
        `"${(r.customer_name ?? '').replace(/"/g, '""')}"`,
        `"${(r.invoice_no ?? '').replace(/"/g, '""')}"`,
        String(r.invoice_date).slice(0, 10),
        r.due_date ? String(r.due_date).slice(0, 10) : '',
        r.total_amount != null ? Number(r.total_amount).toFixed(2) : '',
      ].join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${invYear}-${invMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Accounting helpers ────────────────────────────────────────────────────

  async function fetchAccOrders() {
    const month = `${accYear}-${accMonth}`
    setAccLoading(true)
    setAccRows([])
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')
      const res = await fetch(`${base}/api/accounting-export?month=${month}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch orders')
      setAccRows(data.rows || [])
      setShowAccPreview(true)
    } catch (e: any) {
      alert(e?.message || 'Failed to fetch orders')
    } finally {
      setAccLoading(false)
    }
  }

  function sortedAccRows(rows: ExportRow[]) {
    return [...rows].sort((a, b) => {
      // Normalize order_date (may be Date object or string) to ISO string for comparison
      const dateStr = (v: string | Date) => v instanceof Date ? v.toISOString() : String(v)
      const va = accSortBy === 'order_date' ? dateStr(a.order_date)
               : accSortBy === 'customer_name' ? a.customer_name
               : (a.order_no ?? '')
      const vb = accSortBy === 'order_date' ? dateStr(b.order_date)
               : accSortBy === 'customer_name' ? b.customer_name
               : (b.order_no ?? '')
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return accSortDir === 'asc' ? cmp : -cmp
    })
  }

  function formatAccDate(val: string | Date): string {
    if (!val) return ''
    let year: number, month: number, day: number
    if (val instanceof Date) {
      // Neon returns DATE columns as JS Date objects at UTC midnight
      year = val.getUTCFullYear(); month = val.getUTCMonth() + 1; day = val.getUTCDate()
    } else {
      // Take only the date part (handles "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ssZ")
      const [y, mo, d] = String(val).substring(0, 10).split('-').map(Number)
      year = y; month = mo; day = d
    }
    if (!year) return String(val)
    // Use local Date constructor so the formatter doesn't shift the date
    const d = new Date(year, month - 1, day)
    return new Intl.DateTimeFormat(tenantGeo.default_locale || 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)
  }

  function exportCSV(rows: ExportRow[]) {
    const headers = [
      t('tenantAdmin.colCustomer'), t('tenantAdmin.colOrderNo'), t('tenantAdmin.colOrderDate'),
      t('tenantAdmin.colAmount'), t('tenantAdmin.colPartner'), t('tenantAdmin.colPartnerAmount'),
    ]
    const escape = (v: any) => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [
      headers.map(escape).join(','),
      ...rows.map(r => [
        r.customer_name, r.order_no ?? '', formatAccDate(r.order_date),
        Number(r.order_amount).toFixed(2),
        r.partner_name ?? '', r.partner_amount > 0 ? Number(r.partner_amount).toFixed(2) : '',
      ].map(escape).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-${accYear}-${accMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportExcel(rows: ExportRow[]) {
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
        [t('tenantAdmin.colCustomer')]:     r.customer_name,
        [t('tenantAdmin.colOrderNo')]:      r.order_no ?? '',
        [t('tenantAdmin.colOrderDate')]:    formatAccDate(r.order_date),
        [t('tenantAdmin.colAmount')]:       Number(r.order_amount),
        [t('tenantAdmin.colPartner')]:      r.partner_name ?? '',
        [t('tenantAdmin.colPartnerAmount')]: r.partner_amount > 0 ? Number(r.partner_amount) : '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Orders')
      XLSX.writeFile(wb, `orders-${accYear}-${accMonth}.xlsx`)
    } catch (e: any) {
      alert(e?.message || 'Excel export failed')
    }
  }

  async function loadInvoiceConfig() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')
      const res = await fetch(`${base}/api/tenant-admin?action=getInvoiceConfig`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
        },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.invoiceConfig) {
        const ic = data.invoiceConfig
        setInvoiceCfg({
          autoInvoiceNumber: ic.autoInvoiceNumber ?? false,
          billingCountry: ic.billingCountry ?? '',
          companyName: ic.companyName ?? '',
          companyAddress1: ic.companyAddress1 ?? '',
          companyAddress2: ic.companyAddress2 ?? '',
          companyPhone: ic.companyPhone ?? '',
          contactName: ic.contactName ?? '',
          enabledPaymentMethods: ic.enabledPaymentMethods ?? [],
          bankName: ic.bankName ?? '',
          bankAccountName: ic.bankAccountName ?? '',
          bankAccountNumber: ic.bankAccountNumber ?? '',
          bankRoutingNumber: ic.bankRoutingNumber ?? '',
        })
      }
    } catch { /* silently ignore — form starts empty */ }
  }

  async function handleSaveInvoiceConfig() {
    setSavingInvoice(true)
    try {
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
        body: JSON.stringify({ action: 'updateInvoiceConfig', invoiceConfig: invoiceCfg }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      alert('Invoice configuration saved!')
    } catch (e: any) {
      alert(e?.message || 'Failed to save invoice configuration')
    } finally {
      setSavingInvoice(false)
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

  // Accounting preview derived values (computed at component level to avoid IIFE render issues)
  const accSorted  = sortedAccRows(accRows)
  const accPreview = accSorted.slice(0, 20)
  const accMoney   = (n: number) => Number(n).toFixed(2)
  const accMonthLabel = `${accYear}-${accMonth}`

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

      {/* Tabbed card: Users | Invoicing | Data */}
      <div className="card">

        {/* Tab row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['team', 'invoicing', 'accounting'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? 'primary' : ''}
              style={{ height: 36, flex: 1, minWidth: 0, fontSize: 14, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {tab === 'team' ? t('tenantAdmin.tabUsers')
                : tab === 'invoicing' ? t('tenantAdmin.invoicingTab')
                : t('tenantAdmin.tabData')}
            </button>
          ))}
        </div>

        {/* ── Team Members tab ── */}
        {activeTab === 'team' && (<>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
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
            <div style={{ marginTop: 4 }}>
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
        </>)}

        {/* ── Invoicing tab ── */}
        {activeTab === 'invoicing' && (() => {
          // Payment methods available per billing country
          const pmByCountry: Record<string, Array<{ id: string; labelKey: string; available: boolean }>> = {
            US: [
              { id: 'wire_transfer', labelKey: 'wireTransfer', available: true },
              { id: 'ach',           labelKey: 'ach',          available: false },
            ],
          }
          const availablePMs = pmByCountry[invoiceCfg.billingCountry] ?? null

          return (<>

            {/* Invoice number mode */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('tenantAdmin.invoiceNumberMode')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="invoiceNumberMode"
                    checked={!invoiceCfg.autoInvoiceNumber}
                    onChange={() => setInvoiceCfg(c => ({ ...c, autoInvoiceNumber: false }))}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{t('tenantAdmin.invoiceNumberManual')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="invoiceNumberMode"
                    checked={invoiceCfg.autoInvoiceNumber}
                    onChange={() => setInvoiceCfg(c => ({ ...c, autoInvoiceNumber: true }))}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{t('tenantAdmin.invoiceNumberAuto')}</span>
                </label>
              </div>
            </div>

            {/* Company info */}
            <h4 style={{ margin: '0 0 12px' }}>{t('tenantAdmin.companyInfoSection')}</h4>
            <div style={{ marginBottom: 12 }}>
              <label>{t('invoice.companyName')}</label>
              <input value={invoiceCfg.companyName} onChange={e => setInvoiceCfg(c => ({ ...c, companyName: e.target.value }))} placeholder="Acme Corp" style={{ marginTop: 4 }} />
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <div>
                <label>{t('tenantAdmin.addressLine1')}</label>
                <input value={invoiceCfg.companyAddress1} onChange={e => setInvoiceCfg(c => ({ ...c, companyAddress1: e.target.value }))} placeholder="123 Main St" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label>{t('tenantAdmin.addressLine2')}</label>
                <input value={invoiceCfg.companyAddress2} onChange={e => setInvoiceCfg(c => ({ ...c, companyAddress2: e.target.value }))} placeholder="City, State ZIP" style={{ marginTop: 4 }} />
              </div>
            </div>
            <div className="row" style={{ marginBottom: 24 }}>
              <div>
                <label>{t('phone')}</label>
                <input value={invoiceCfg.companyPhone} onChange={e => setInvoiceCfg(c => ({ ...c, companyPhone: e.target.value }))} placeholder="(000) 000-0000" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label>{t('tenantAdmin.invoiceContactName')}</label>
                <input value={invoiceCfg.contactName} onChange={e => setInvoiceCfg(c => ({ ...c, contactName: e.target.value }))} placeholder="Full name" style={{ marginTop: 4 }} />
              </div>
            </div>

            {/* Billing country */}
            <h4 style={{ margin: '0 0 8px' }}>{t('tenantAdmin.paymentOptions')}</h4>
            <div style={{ marginBottom: 8 }}>
              <label>{t('tenantAdmin.billingCountry')}</label>
              <select
                value={invoiceCfg.billingCountry}
                onChange={e => setInvoiceCfg(c => ({ ...c, billingCountry: e.target.value, enabledPaymentMethods: [] }))}
                style={{ marginTop: 4 }}
              >
                <option value="">{t('tenantAdmin.selectBillingCountry')}</option>
                <option value="US">{t('tenantAdmin.countryUS')}</option>
                <option value="SE">{t('tenantAdmin.countrySweden')}</option>
                <option value="EU">{t('tenantAdmin.countryEU')}</option>
                <option value="GB">{t('tenantAdmin.countryUK')}</option>
              </select>
            </div>
            <p className="helper" style={{ marginBottom: 16 }}>{t('tenantAdmin.billingCountryHelp')}</p>

            {/* Payment method checkboxes — driven by billing country */}
            {invoiceCfg.billingCountry === '' ? null : availablePMs ? (<>
              <p className="helper" style={{ marginBottom: 10 }}>{t('tenantAdmin.paymentOptionsHelp')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {availablePMs.map(pm => (
                  <label
                    key={pm.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: pm.available ? 'pointer' : 'not-allowed', opacity: pm.available ? 1 : 0.45, margin: 0 }}
                  >
                    <input
                      type="checkbox"
                      disabled={!pm.available}
                      checked={invoiceCfg.enabledPaymentMethods.includes(pm.id)}
                      onChange={e => setInvoiceCfg(c => ({
                        ...c,
                        enabledPaymentMethods: e.target.checked
                          ? [...c.enabledPaymentMethods, pm.id]
                          : c.enabledPaymentMethods.filter(m => m !== pm.id),
                      }))}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontWeight: 600 }}>{t(`tenantAdmin.${pm.labelKey}`)}</span>
                    {!pm.available && <span className="helper" style={{ fontSize: 12 }}>{t('tenantAdmin.comingSoon')}</span>}
                  </label>
                ))}
              </div>
            </>) : (
              <p className="helper" style={{ marginBottom: 20 }}>{t('tenantAdmin.paymentMethodsComingSoon')}</p>
            )}

            {/* Wire Transfer detail fields */}
            {invoiceCfg.enabledPaymentMethods.includes('wire_transfer') && (<>
              <h4 style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{t('tenantAdmin.wireTransferDetails')}</h4>
              <div style={{ marginBottom: 12 }}>
                <label>{t('tenantAdmin.bankName')}</label>
                <input value={invoiceCfg.bankName} onChange={e => setInvoiceCfg(c => ({ ...c, bankName: e.target.value }))} placeholder="Bank of America" style={{ marginTop: 4 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>{t('tenantAdmin.accountName')}</label>
                <input value={invoiceCfg.bankAccountName} onChange={e => setInvoiceCfg(c => ({ ...c, bankAccountName: e.target.value }))} placeholder="Acme Corp" style={{ marginTop: 4 }} />
              </div>
              <div className="row" style={{ marginBottom: 24 }}>
                <div>
                  <label>{t('tenantAdmin.accountNumber')}</label>
                  <input value={invoiceCfg.bankAccountNumber} onChange={e => setInvoiceCfg(c => ({ ...c, bankAccountNumber: e.target.value }))} placeholder="000000000000" style={{ marginTop: 4 }} />
                </div>
                <div>
                  <label>{t('tenantAdmin.routingNumber')}</label>
                  <input value={invoiceCfg.bankRoutingNumber} onChange={e => setInvoiceCfg(c => ({ ...c, bankRoutingNumber: e.target.value }))} placeholder="000000000" style={{ marginTop: 4 }} />
                </div>
              </div>
            </>)}

            <button
              className="primary"
              onClick={handleSaveInvoiceConfig}
              disabled={savingInvoice}
              style={{ height: CONTROL_H, padding: '0 32px' }}
            >
              {savingInvoice ? t('saving') : t('save')}
            </button>

          </>)
        })()}

        {/* ── Accounting tab ── */}
        {activeTab === 'accounting' && (<>

          <h4 style={{ margin: '0 0 16px' }}>{t('tenantAdmin.exportsSection')}</h4>

          {/* Period selector + fetch button */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <label>{t('tenantAdmin.selectYear')}</label>
              <select value={accYear} onChange={e => setAccYear(e.target.value)} style={{ marginTop: 4, width: 100 }}>
                {Array.from({ length: 6 }, (_, i) => currentYear - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('tenantAdmin.selectMonth')}</label>
              <select value={accMonth} onChange={e => setAccMonth(e.target.value)} style={{ marginTop: 4, width: 140 }}>
                {[
                  ['01','January'],['02','February'],['03','March'],['04','April'],
                  ['05','May'],['06','June'],['07','July'],['08','August'],
                  ['09','September'],['10','October'],['11','November'],['12','December'],
                ].map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <button
              className="primary"
              onClick={fetchAccOrders}
              disabled={accLoading}
              style={{ height: CONTROL_H, padding: '0 24px' }}
            >
              {accLoading ? t('loadingDots') : t('tenantAdmin.allOrdersButton')}
            </button>
          </div>

          {/* Invoice export */}
          <h4 style={{ margin: '24px 0 16px' }}>{t('tenantAdmin.invoiceExportSection')}</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <label>{t('tenantAdmin.selectYear')}</label>
              <select value={invYear} onChange={e => setInvYear(e.target.value)} style={{ marginTop: 4, width: 100 }}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('tenantAdmin.selectMonth')}</label>
              <select value={invMonth} onChange={e => setInvMonth(e.target.value)} style={{ marginTop: 4, width: 140 }}>
                {[
                  ['01','January'],['02','February'],['03','March'],['04','April'],
                  ['05','May'],['06','June'],['07','July'],['08','August'],
                  ['09','September'],['10','October'],['11','November'],['12','December'],
                ].map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <button
              className="primary"
              onClick={() => fetchInvoices()}
              disabled={invLoading}
              style={{ height: CONTROL_H, padding: '0 24px' }}
            >
              {invLoading ? t('loadingDots') : t('tenantAdmin.allInvoicesButton')}
            </button>
          </div>

        </>)}

      </div>{/* end tabbed card */}

      {/* ── Invoice preview modal ── */}
      {showInvPreview && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setShowInvPreview(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>{t('tenantAdmin.invoicePreviewTitle', { month: `${invYear}-${invMonth}` })}</h3>
                <p className="helper" style={{ marginTop: 4 }}>{invRows.length} {invRows.length === 1 ? 'invoice' : 'invoices'}</p>
              </div>
              <button onClick={() => setShowInvPreview(false)} style={{ height: 36, padding: '0 16px' }}>{t('close')}</button>
            </div>

            {invRows.length === 0 ? (
              <p className="helper">{t('tenantAdmin.noInvoicesForPeriod')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                      {[
                        t('tenantAdmin.colCustomer'), t('tenantAdmin.colInvoiceNo'),
                        t('tenantAdmin.colInvoiceDate'), t('tenantAdmin.colDueDate'), t('tenantAdmin.colTotal'), '',
                      ].map((h, i) => (
                        <th key={i} style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invRows.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px 10px' }}>{r.customer_name ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{r.invoice_no ?? '—'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{String(r.invoice_date).slice(0, 10)}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.due_date ? String(r.due_date).slice(0, 10) : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{r.total_amount != null ? Number(r.total_amount).toFixed(2) : '—'}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <button
                            style={{ height: 28, padding: '0 12px', fontSize: 12 }}
                            onClick={async () => {
                              try {
                                const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
                                const token = localStorage.getItem('authToken')
                                const activeTenantId = localStorage.getItem('activeTenantId')
                                const res = await fetch(`${base}/api/invoices?id=${r.id}`, {
                                  headers: {
                                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                    ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
                                  },
                                })
                                if (!res.ok) throw new Error('Failed to load invoice')
                                const data = await res.json()
                                navigate('/invoices/preview', { state: { ...data.invoice_data, _fromSaved: true, _returnYear: invYear, _returnMonth: invMonth } })
                              } catch (e: any) {
                                alert(e?.message || 'Could not open invoice')
                              }
                            }}
                          >
                            {t('view')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {invRows.length > 0 && (
              <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                <button onClick={() => exportInvoiceCSV(invRows)} style={{ height: 36, padding: '0 20px' }}>
                  {t('tenantAdmin.exportCSV')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Accounting preview modal ── */}
      {showAccPreview && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setShowAccPreview(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 860, width: '100%', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>{t('tenantAdmin.previewTitle', { month: accMonthLabel })}</h3>
                <p className="helper" style={{ marginTop: 4 }}>
                  {accRows.length > 20
                    ? t('tenantAdmin.previewShowing', { count: 20, total: accRows.length })
                    : t('tenantAdmin.previewAllRows', { total: accRows.length })}
                </p>
              </div>
              <button onClick={() => setShowAccPreview(false)} style={{ height: 36, padding: '0 16px' }}>{t('close')}</button>
            </div>

            {/* Sort controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('tenantAdmin.sortLabel')}</span>
              {([
                ['order_no',       t('tenantAdmin.colOrderNo')],
                ['order_date',     t('tenantAdmin.sortByDate')],
                ['customer_name',  t('tenantAdmin.sortByCustomer')],
              ] as const).map(([field, label]) => (
                <button
                  key={field}
                  onClick={() => {
                    if (accSortBy === field) setAccSortDir(d => d === 'asc' ? 'desc' : 'asc')
                    else { setAccSortBy(field); setAccSortDir('asc') }
                  }}
                  className={accSortBy === field ? 'primary' : ''}
                  style={{ height: 32, padding: '0 14px', fontSize: 13 }}
                >
                  {label}{accSortBy === field && (accSortDir === 'asc' ? ' ↑' : ' ↓')}
                </button>
              ))}
            </div>

            {/* Table */}
            {accRows.length === 0 ? (
              <p className="helper">{t('tenantAdmin.noDataForPeriod')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                      {[
                        t('tenantAdmin.colCustomer'), t('tenantAdmin.colOrderNo'),
                        t('tenantAdmin.colOrderDate'), t('tenantAdmin.colAmount'),
                        t('tenantAdmin.colPartner'), t('tenantAdmin.colPartnerAmount'),
                      ].map(h => (
                        <th key={h} style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {accPreview.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '8px 10px' }}>{r.customer_name}</td>
                        <td style={{ padding: '8px 10px' }}>{r.order_no ?? '—'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{formatAccDate(r.order_date)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{accMoney(r.order_amount)}</td>
                        <td style={{ padding: '8px 10px' }}>{r.partner_name ?? '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{r.partner_amount > 0 ? accMoney(r.partner_amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Export buttons */}
            {accRows.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <button onClick={() => exportCSV(accSorted)} style={{ height: 36, padding: '0 20px' }}>
                  {t('tenantAdmin.exportCSV')}
                </button>
                <button onClick={() => exportExcel(accSorted)} style={{ height: 36, padding: '0 20px' }}>
                  {t('tenantAdmin.exportExcel')}
                </button>
                <span className="helper" style={{ alignSelf: 'center', fontSize: 12 }}>
                  {t('tenantAdmin.googleSheetsHint')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

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
                <option value="COP">COP – Colombian Peso</option>
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
