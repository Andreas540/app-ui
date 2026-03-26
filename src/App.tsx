// src/App.tsx
import MaintenanceGate from './components/MaintenanceGate'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useTranslation } from 'react-i18next'
import { DEFAULT_SHORTCUTS, ALL_SHORTCUTS } from './lib/shortcuts'
import { getAuthHeaders } from './lib/api'

import Dashboard from './pages/Dashboard'
import NewOrder from './pages/NewOrder'
import EditOrder from './pages/EditOrder'
import Customers from './pages/Customers'
import Settings from './pages/Settings'
import Payments from './pages/Payments'
import CreateCustomer from './pages/CreateCustomer'
import CustomerDetail from './pages/CustomerDetail'
import EditCustomer from './pages/EditCustomer'
import NewProduct from './pages/NewProduct'
import EditProduct from './pages/EditProduct'
import Partners from './pages/Partners'
import CreatePartner from './pages/CreatePartner'
import PartnerDetail from './pages/PartnerDetail'
import EditPartner from './pages/EditPartner'
import Login from './pages/Login'
import EditPayment from './pages/EditPayment'
import './print.css'
import CreateInvoicePage from './pages/CreateInvoice'
import InvoicePreview from './pages/InvoicePreview'
import PriceChecker from './pages/PriceChecker'
import Suppliers from './pages/Suppliers'
import CreateSupplier from './pages/CreateSupplier'
import NewOrderSupplier from './pages/NewOrderSupplier'
import SupplierDetail from './pages/SupplierDetail'
import EditOrderSupplier from './pages/EditOrderSupplier'
import NewCost from './pages/NewCost'
import Warehouse from './pages/Warehouse'
import SupplyChainOverview from './pages/SupplyChainOverview'
import TenantAdmin from './pages/TenantAdmin'
import EditSupplier from './pages/EditSupplier'
import SuperAdmin from './pages/SuperAdmin'
import DashboardStore from './pages/DashboardStore'
import LaborProduction from './pages/LaborProduction'
import TimeEntry from './pages/TimeEntry'
import EmployeeManagement from './pages/EmployeeManagement'
import TimeApproval from './pages/TimeApproval'
import TimeEntrySimple from './pages/TimeEntrySimple'
import { useIdleTimeout } from './hooks/useIdleTimeout'
import TenantSwitcher from './components/TenantSwitcher'
import Contact from './pages/Contact'
import Messages from './pages/Messages'
import StatsLogs from './pages/StatsLogs'
import BookingIntegrationPage from './pages/BookingIntegrationPage'
import BookingDashboardPage from './pages/BookingDashboardPage'
import BookingsPage from './pages/BookingsPage'
import BookingCustomersPage from './pages/BookingCustomersPage'
import BookingPaymentsPage from './pages/BookingPaymentsPage'
import BookingRemindersPage from './pages/BookingRemindersPage'
import BookingSmsUsagePage from './pages/BookingSmsUsagePage'
import BookingDetailPage from './pages/BookingDetailPage'
import NewBookingPage from './pages/NewBookingPage'
import ReportsPage from './pages/ReportsPage'

function apiBase() {
  return import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
}

export default function App() {
  const location = useLocation()

  const isEmployeePath = useMemo(() => {
  const p = location.pathname || '/'
  const hash = window.location.hash || ''
  
  // Only treat as employee path if:
  // 1. Starts with /time-entry-simple, OR
  // 2. Has /time-entry/ with something after it (the token)
  return p.startsWith('/time-entry-simple') || 
         p.match(/^\/time-entry\/.+/) !== null ||
         hash.includes('/time-entry-simple') ||
         hash.match(/\/time-entry\/.+/) !== null
}, [location.pathname])

  const [employeeMode, setEmployeeMode] = useState<null | boolean>(null)

  useEffect(() => {
    let alive = true

    async function decideEmployeeMode() {
      if (isEmployeePath) {
        if (alive) setEmployeeMode(true)
        return
      }

      try {
        const base = apiBase()
        const res = await fetch(`${base}/api/employee-session`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!alive) return

        if (res.ok) {
          const j = await res.json().catch(() => ({}))
          if (j?.active === true) {
            setEmployeeMode(true)
            return
          }
        }
      } catch {
        // ignore
      }

      if (alive) setEmployeeMode(false)
    }

    decideEmployeeMode()
    return () => {
      alive = false
    }
  }, [isEmployeePath])

  if (employeeMode === null) {
    return <div style={{ padding: 16, color: '#fff' }}>Loading…</div>
  }

  if (employeeMode === true) {
    return <EmployeeShell />
  }

  return <MainApp />
}

function EmployeeShell() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto',
        background: 'var(--bg, #1a1a2e)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <main className="content" style={{ padding: 16, minHeight: '100%' }}>
        <Routes>
          <Route path="/time-entry-simple/:token" element={<TimeEntrySimple />} />
          <Route path="/time-entry/:token" element={<TimeEntry />} />
          <Route path="/time-entry-simple" element={<TimeEntrySimple />} />
          <Route path="/time-entry" element={<TimeEntry />} />
          <Route path="*" element={<Navigate to="/time-entry-simple" replace />} />
        </Routes>
      </main>
    </div>
  )
}

// ── Page-view action mapping ───────────────────────────────────────────────────
const PAGE_ACTIONS: Record<string, string> = {
  '/':                           'page_view_dashboard',
  '/customers':                  'page_view_customers',
  '/customers/new':              'page_view_create_customer',
  '/customers/:id':              'page_view_customer_detail',
  '/customers/:id/edit':         'page_view_edit_customer',
  '/partners':                   'page_view_partners',
  '/partners/new':               'page_view_create_partner',
  '/partners/:id':               'page_view_partner_detail',
  '/partners/:id/edit':          'page_view_edit_partner',
  '/price-checker':              'page_view_price_checker',
  '/orders/new':                 'page_view_new_order',
  '/orders/:id/edit':            'page_view_edit_order',
  '/payments':                   'page_view_payments',
  '/payments/:id/edit':          'page_view_edit_payment',
  '/products/new':               'page_view_new_product',
  '/products/edit':              'page_view_edit_product',
  '/invoices/create':            'page_view_create_invoice',
  '/invoices/preview':           'page_view_invoice_preview',
  '/suppliers':                  'page_view_suppliers',
  '/suppliers/new':              'page_view_create_supplier',
  '/suppliers/:id':              'page_view_supplier_detail',
  '/suppliers/:id/edit':         'page_view_edit_supplier',
  '/supplier-orders/new':        'page_view_new_supplier_order',
  '/supplier-orders/:id/edit':   'page_view_edit_supplier_order',
  '/costs/new':                  'page_view_new_cost',
  '/reports':                    'page_view_reports',
  '/warehouse':                  'page_view_warehouse',
  '/supply-chain':               'page_view_supply_chain',
  '/labor-production':           'page_view_labor_production',
  '/time-entry':                 'page_view_time_entry',
  '/employees':                  'page_view_employees',
  '/time-approval':              'page_view_time_approval',
  '/settings':                   'page_view_settings',
  '/contact':                    'page_view_contact',
  '/admin':                      'page_view_tenant_admin',
  '/super-admin':                'page_view_super_admin',
  '/messages':                   'page_view_messages',
  '/stats-logs':                 'page_view_stats_logs',
  '/bookings':                   'page_view_booking_dashboard',
  '/bookings/list':              'page_view_bookings_list',
  '/bookings/:id':               'page_view_booking_detail',
  '/bookings/clients':           'page_view_booking_clients',
  '/bookings/payments':          'page_view_booking_payments',
  '/bookings/reminders':         'page_view_booking_reminders',
  '/bookings/sms-usage':         'page_view_booking_sms_usage',
  '/bookings/integration':       'page_view_booking_integration',
}

function pathnameToAction(pathname: string): string | null {
  // Normalise dynamic segments (UUIDs and numeric IDs → :id)
  const normalised = pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
  return PAGE_ACTIONS[normalised] ?? null
}

function MainApp() {
  const { t } = useTranslation('navigation')
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [userName, setUserName] = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(DEFAULT_SHORTCUTS)

  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(localStorage.getItem('activeTenantId'))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('nav_collapsed') || '{}') } catch { return {} }
  })

  const { isAuthenticated, user, logout: authLogout, hasFeature, verifyAuth } = useAuth()

  const [legacyUserLevel, setLegacyUserLevel] = useState<'admin' | 'inventory' | null>(
    (localStorage.getItem('userLevel') as 'admin' | 'inventory') || null
  )

  const isLoggedIn = isAuthenticated || legacyUserLevel !== null

  // 🆕 Idle timeout - auto logout after 15 minutes of inactivity
  useIdleTimeout(
    90 * 60 * 1000, // 15 minutes
    () => {
      console.log('Auto-logout due to inactivity')
      handleLogout(null) // idle timeout already logged by useIdleTimeout
    }
  )

  const handleLogout = async (logAction: string | null = 'logout_active') => {
    if (logAction) {
      try {
        const base = apiBase()
        await fetch(`${base}/api/log-activity`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ action: logAction }),
        })
      } catch {}
    }

    try {
      authLogout()
    } catch {}

    setLegacyUserLevel(null)
    localStorage.removeItem('userLevel')
    localStorage.removeItem('authToken')
    localStorage.removeItem('activeTenantId')

    window.location.href = '/login'
  }

  // Periodically verify the token so expired sessions redirect to login
  // without waiting for the idle timeout or an API call to fail.
  // verifyAuthRef avoids stale closure without restarting the interval on every render.
  const verifyAuthRef = useRef(verifyAuth)
  useEffect(() => { verifyAuthRef.current = verifyAuth })
  useEffect(() => {
    if (!isAuthenticated) return
    const id = setInterval(async () => {
      const valid = await verifyAuthRef.current()
      if (!valid) window.location.href = '/login'
    }, 5 * 60 * 1000) // every 5 minutes
    return () => clearInterval(id)
  }, [isAuthenticated])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('userSettings')
      if (saved) {
        const settings = JSON.parse(saved)
        const loadedName = settings.userName || 'User'
        setUserName(loadedName)
        setSelectedShortcuts(settings.selectedShortcuts || DEFAULT_SHORTCUTS)
      } else {
        setUserName('User')
      }
    } catch {
      setUserName('User')
    }

    const timer = setTimeout(() => setShowWelcome(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !user) return

    const loadTenants = async () => {
      try {
        const base = apiBase()
        const token = localStorage.getItem('authToken')

        const res = await fetch(`${base}/api/user-tenants`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })

        if (res.ok) {
          const data = await res.json()
          setAvailableTenants(data.tenants || [])

          if (!activeTenantId && data.tenants.length > 0) {
  const firstTenantId = data.tenants[0].id

  setActiveTenantId(firstTenantId)
  localStorage.setItem('activeTenantId', firstTenantId)

  // Reload the page ONCE right after the tenant is set (prevents iOS using the default icon)
  if (!sessionStorage.getItem('didPostLoginReload')) {
    sessionStorage.setItem('didPostLoginReload', '1')
    window.location.reload()
  }
}

        }
      } catch (e) {
        console.error('Failed to load tenants:', e)
      }
    }

    loadTenants()
  }, [isAuthenticated, user])

  // ── Page-view logging ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return
    const action = pathnameToAction(location.pathname)
    if (!action) return
    const base = apiBase()
    fetch(`${base}/api/log-activity`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ action }),
    }).catch(() => {})
  }, [location.pathname, isLoggedIn])

  // Auto-redirect from / if user doesn't have dashboard access
useEffect(() => {
  if (location.pathname === '/' && !hasFeature('dashboard') && user) {
    // Find first available feature following menu order (top to bottom)
    const availableFeatures = [
      // Sales section
      { id: 'dashboard', route: '/' },
      { id: 'customers', route: '/customers' },
      { id: 'partners', route: '/partners' },
      { id: 'price-checker', route: '/price-checker' },
      { id: 'orders', route: '/orders/new' },
      { id: 'payments', route: '/payments' },
      { id: 'products', route: '/products/new' },
      { id: 'invoices', route: '/invoices/create' },
      
      // Inventory section
      { id: 'supply-chain', route: '/supply-chain' },
      { id: 'suppliers', route: '/suppliers' },
      { id: 'supplier-orders', route: '/supplier-orders/new' },
      { id: 'warehouse', route: '/warehouse' },
      
      // Other section
      { id: 'production', route: '/labor-production' },
      { id: 'time-entry', route: '/time-entry' },
      { id: 'employees', route: '/employees' },
      { id: 'time-approval', route: '/time-approval' },
      { id: 'costs', route: '/costs/new' },
      { id: 'tenant-admin', route: '/admin' },
      { id: 'settings', route: '/settings' },
    ]
    
    const firstAvailable = availableFeatures.find(f => hasFeature(f.id as any))
    if (firstAvailable) {
      window.location.href = firstAvailable.route
    }
  }
}, [location.pathname, user, hasFeature])

  if (!isLoggedIn) return <Login />

  const handleTenantSwitch = async () => {
    if (availableTenants.length <= 1) return

    const currentIndex = availableTenants.findIndex(t => t.id === activeTenantId)
    const nextIndex = (currentIndex + 1) % availableTenants.length
    const nextTenant = availableTenants[nextIndex]

    localStorage.setItem('activeTenantId', nextTenant.id)

    try {
      const base = apiBase()
      const token = localStorage.getItem('authToken')

      const res = await fetch(`${base}/api/auth-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Active-Tenant': nextTenant.id,
        },
        body: JSON.stringify({ token }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.user) localStorage.setItem('userData', JSON.stringify(data.user))
      }
    } catch (e) {
      console.error('Failed to refresh user data:', e)
    }

    window.location.reload()
  }

  const currentTenant = availableTenants.find(t => t.id === activeTenantId)
  const currentTenantName = currentTenant?.name || user?.tenantName || 'My Biz'

  return (
    <div className="app"> 
    <MaintenanceGate />  {/* 👈 ADD HERE */}     
      <header className="topbar">        
        <div className="brand">
          <button className="hamburger" aria-label="Toggle menu" onClick={() => setNavOpen(v => !v)}>
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div
            className="brand-title"
            onClick={handleTenantSwitch}
            style={{
              cursor: availableTenants.length > 1 ? 'pointer' : 'default',
              userSelect: 'none',
            }}
            title={availableTenants.length > 1 ? 'Click to switch tenant' : ''}
          >
            <div
              style={{
                transform: showWelcome ? 'translateY(0)' : 'translateY(-100%)',
                transition: 'transform 0.6s ease-in-out',
                position: 'absolute',
                width: '100%',
              }}
            >
              {t('welcome', { name: userName })}
            </div>
            <div
              style={{
                transform: showWelcome ? 'translateY(100%)' : 'translateY(0)',
                transition: 'transform 0.6s ease-in-out',
                position: 'absolute',
                width: '100%',
              }}
            >
              {currentTenantName}
            </div>
          </div>
        </div>

        <div className="quick-buttons" aria-label="Quick navigation">
  {user?.businessType !== 'physical_store' && selectedShortcuts.map(featureId => {
    const shortcut = ALL_SHORTCUTS.find(s => s.id === featureId)
    if (!shortcut || !hasFeature(featureId as any)) return null
    return (
      <NavLink
        key={featureId}
        to={shortcut.route}
        end={shortcut.route === '/'}
        className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
        title={shortcut.label}
        onClick={() => setNavOpen(false)}
      >
        {shortcut.letter}
      </NavLink>
    )
  })}
</div>
      </header>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className="layout">
        <nav className={`nav ${navOpen ? 'open' : ''}`}>
          {(() => {
            // SuperAdmin with tenant selected gets access to ALL features
            const superAdminWithTenant = user?.role === 'super_admin' && user?.tenantId
            const canAccess = (featureId: string) => hasFeature(featureId as any) || superAdminWithTenant

            if (user?.businessType === 'physical_store') {
              return (
                <>
                  {canAccess('dashboard') && (
                    <NavLink to="/" onClick={() => setNavOpen(false)}>
                      {t('storeDashboard')}
                    </NavLink>
                  )}
                  {canAccess('settings') && (
                    <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                      {t('settings')}
                    </NavLink>
                  )}
                  <button
                    onClick={() => handleLogout()}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--muted)',
                      color: 'var(--muted)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      marginTop: '8px',
                      width: '75%',
                    }}
                  >
                    {t('logout')}
                  </button>
                </>
              )
            }

            const toggleSection = (id: string) => {
              setCollapsed(prev => {
                const next = { ...prev, [id]: !prev[id] }
                localStorage.setItem('nav_collapsed', JSON.stringify(next))
                return next
              })
            }
            const sectionHeader = (id: string, label: string, first = false) => (
              <button
                onClick={() => toggleSection(id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                  fontWeight: 700, color: '#fff', fontSize: 15,
                  marginTop: first ? 8 : 16, marginBottom: collapsed[id] ? 0 : 8,
                  paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.2)',
                  textAlign: 'left', padding: '0 0 8px 0',
                }}
              >
                <span>{label}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{collapsed[id] ? '▶' : '▼'}</span>
              </button>
            )

            return (
              <>
                {sectionHeader('sales', t('salesCashFlow'), true)}
                {!collapsed['sales'] && (<>
                {canAccess('dashboard') && (
                  <NavLink to="/" end onClick={() => setNavOpen(false)}>
                    {t('mainDashboard')}
                  </NavLink>
                )}
                {canAccess('customers') && (
                  <NavLink to="/customers" onClick={() => setNavOpen(false)}>
                    {t('customers')}
                  </NavLink>
                )}
                {canAccess('partners') && (
                  <NavLink to="/partners" onClick={() => setNavOpen(false)}>
                    {t('partners')}
                  </NavLink>
                )}
                {canAccess('price-checker') && (
                  <NavLink to="/price-checker" onClick={() => setNavOpen(false)}>
                    {t('priceChecker')}
                  </NavLink>
                )}
                {canAccess('orders') && (
                  <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>
                    {t('newOrder')}
                  </NavLink>
                )}
                {canAccess('payments') && (
                  <NavLink to="/payments" onClick={() => setNavOpen(false)}>
                    {t('newPayment')}
                  </NavLink>
                )}
                {canAccess('products') && (
                  <NavLink to="/products/new" onClick={() => setNavOpen(false)}>
                    {t('products')}
                  </NavLink>
                )}
                {canAccess('invoices') && (
                  <NavLink to="/invoices/create" onClick={() => setNavOpen(false)}>
                    {t('createInvoice')}
                  </NavLink>
                )}
                {canAccess('costs') && (
                  <NavLink to="/costs/new" onClick={() => setNavOpen(false)}>
                    {t('newCost')}
                  </NavLink>
                )}
                </>)}
                {canAccess('financial') && (<>
                  {sectionHeader('reports', t('reportsSection'))}
                  {!collapsed['reports'] && (
                    <NavLink to="/reports" onClick={() => setNavOpen(false)}>
                      {t('reportsSalesProfit')}
                    </NavLink>
                  )}
                </>)}
                {sectionHeader('supply', t('supplyChain'))}
                {!collapsed['supply'] && (<>
                {canAccess('supply-chain') && (
                  <NavLink to="/supply-chain" onClick={() => setNavOpen(false)}>
                    {t('supplyDemand')}
                  </NavLink>
                )}
                {canAccess('production') && (
                  <NavLink to="/labor-production" onClick={() => setNavOpen(false)}>
                    {t('production')}
                  </NavLink>
                )}
                {canAccess('warehouse') && (
                  <NavLink to="/warehouse" onClick={() => setNavOpen(false)}>
                    {t('warehouse')}
                  </NavLink>
                )}
                {canAccess('supplier-orders') && (
                  <NavLink to="/supplier-orders/new" onClick={() => setNavOpen(false)}>
                    {t('newOrderSupplier')}
                  </NavLink>
                )}
                {canAccess('suppliers') && (
                  <NavLink to="/suppliers" end onClick={() => setNavOpen(false)}>
                    {t('suppliers')}
                  </NavLink>
                )}
                </>)}

                {sectionHeader('labor', t('employeeManagement'))}
                {!collapsed['labor'] && (<>
                {canAccess('employees') && (
                  <NavLink to="/employees" onClick={() => setNavOpen(false)}>
                    {t('employees')}
                  </NavLink>
                )}
                {canAccess('time-approval') && (
                  <NavLink to="/time-approval" onClick={() => setNavOpen(false)}>
                    {t('timeApproval')}
                  </NavLink>
                )}
                {canAccess('time-entry') && (
                  <NavLink to="/time-entry" onClick={() => setNavOpen(false)}>
                    {t('timeEntry')}
                  </NavLink>
                )}
                </>)}

                {canAccess('booking-dashboard') && (<>
                  {sectionHeader('booking', t('bookingSection', { ns: 'navigation' }))}
                  {!collapsed['booking'] && (<>
                    <NavLink to="/bookings" end onClick={() => setNavOpen(false)}>
                      {t('bookingDashboard', { ns: 'navigation' })}
                    </NavLink>
                    {canAccess('new-booking') && (
                      <NavLink to="/bookings/new" onClick={() => setNavOpen(false)}>
                        {t('newBooking', { ns: 'navigation' })}
                      </NavLink>
                    )}
                    {canAccess('bookings') && (
                      <NavLink to="/bookings/list" onClick={() => setNavOpen(false)}>
                        {t('bookingList', { ns: 'navigation' })}
                      </NavLink>
                    )}
                    {canAccess('booking-customers') && (
                      <NavLink to="/bookings/clients" onClick={() => setNavOpen(false)}>
                        {t('bookingClients', { ns: 'navigation' })}
                      </NavLink>
                    )}
                    {canAccess('booking-payments') && (
                      <NavLink to="/bookings/payments" onClick={() => setNavOpen(false)}>
                        {t('bookingPayments', { ns: 'navigation' })}
                      </NavLink>
                    )}
                    {canAccess('booking-reminders') && (
                      <NavLink to="/bookings/reminders" onClick={() => setNavOpen(false)}>
                        {t('bookingReminders', { ns: 'navigation' })}
                      </NavLink>
                    )}
                    {canAccess('booking-sms-usage') && (
                      <NavLink to="/bookings/sms-usage" onClick={() => setNavOpen(false)}>
                        {t('bookingSmsUsage', { ns: 'navigation' })}
                      </NavLink>
                    )}
                    {canAccess('booking-integration') && (
                      <NavLink to="/bookings/integration" onClick={() => setNavOpen(false)}>
                        {t('bookingIntegrationNav', { ns: 'navigation' })}
                      </NavLink>
                    )}
                  </>)}
                </>)}

                {sectionHeader('admin', t('admin'))}
                {!collapsed['admin'] && (<>
                <NavLink to="/contact" onClick={() => setNavOpen(false)}>
                  {t('contact')}
                </NavLink>
                {(user?.role === 'tenant_admin' || user?.role === 'super_admin' || canAccess('tenant-admin')) && (
                  <NavLink to="/admin" onClick={() => setNavOpen(false)}>
                    {t('accountAdmin')}
                  </NavLink>
                )}
                {canAccess('settings') && (
                  <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                    {t('settings')}
                  </NavLink>
                )}
                {user?.role === 'super_admin' && (
                  <NavLink to="/super-admin" onClick={() => setNavOpen(false)}>
                    {t('superAdmin')}
                  </NavLink>
                )}
                {user?.role === 'super_admin' && (
                  <NavLink to="/messages" onClick={() => setNavOpen(false)}>
                    {t('messages')}
                  </NavLink>
                )}
                {user?.role === 'super_admin' && (
                  <NavLink to="/stats-logs" onClick={() => setNavOpen(false)}>
                    Stats &amp; Logs
                  </NavLink>
                )}
                </>)}

                <button
                  onClick={() => handleLogout()}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--muted)',
                    color: 'var(--muted)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    marginTop: '16px',
                    width: '75%',
                  }}
                >
                  {t('logout')}
                </button>
              </>
            )
          })()}
        </nav>

        <main className="content">
          <TenantSwitcher />
          <Routes>
            {user?.businessType === 'physical_store' ? (
              <>
                {hasFeature('dashboard') && <Route path="/" element={<DashboardStore />} />}
                {hasFeature('settings') && <Route path="/settings" element={<Settings />} />}
              </>
            ) : (
              <>
                {hasFeature('dashboard') && <Route path="/" element={<Dashboard />} />}
                {hasFeature('orders') && (
                  <>
                    <Route path="/orders/new" element={<NewOrder />} />
                    <Route path="/orders/:orderId/edit" element={<EditOrder />} />
                  </>
                )}
                {hasFeature('payments') && (
                  <>
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/payments/:paymentId/edit" element={<EditPayment />} />
                  </>
                )}
                {hasFeature('products') && (
                  <>
                    <Route path="/products/new" element={<NewProduct />} />
                    <Route path="/products/edit" element={<EditProduct />} />
                  </>
                )}
                {hasFeature('customers') && (
                  <>
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/customers/new" element={<CreateCustomer />} />
                    <Route path="/customers/:id" element={<CustomerDetail />} />
                    <Route path="/customers/:id/edit" element={<EditCustomer />} />
                  </>
                )}
                {hasFeature('settings') && <Route path="/settings" element={<Settings />} />}
                <Route path="/contact" element={<Contact />} />
                {hasFeature('partners') && (
                  <>
                    <Route path="/partners" element={<Partners />} />
                    <Route path="/partners/new" element={<CreatePartner />} />
                    <Route path="/partners/:id" element={<PartnerDetail />} />
                    <Route path="/partners/:id/edit" element={<EditPartner />} />
                  </>
                )}                
                {hasFeature('invoices') && (
                  <>
                    <Route path="/invoices/create" element={<CreateInvoicePage />} />
                    <Route path="/invoices/preview" element={<InvoicePreview />} />
                  </>
                )}
                {hasFeature('price-checker') && <Route path="/price-checker" element={<PriceChecker />} />}
                {hasFeature('suppliers') && (
                  <>
                    <Route path="/suppliers" element={<Suppliers />} />
                    <Route path="/suppliers/new" element={<CreateSupplier />} />
                    <Route path="/suppliers/:id" element={<SupplierDetail />} />
                    <Route path="/suppliers/:id/edit" element={<EditSupplier />} />
                  </>
                )}
                {hasFeature('supplier-orders') && (
                  <>
                    <Route path="/supplier-orders/new" element={<NewOrderSupplier />} />
                    <Route path="/supplier-orders/:id/edit" element={<EditOrderSupplier />} />
                  </>
                )}
                {hasFeature('costs') && <Route path="/costs/new" element={<NewCost />} />}
                {hasFeature('financial') && <Route path="/reports" element={<ReportsPage />} />}
                {hasFeature('warehouse') && <Route path="/warehouse" element={<Warehouse />} />}
                {hasFeature('supply-chain') && <Route path="/supply-chain" element={<SupplyChainOverview />} />}
                {(user?.role === 'tenant_admin' || user?.role === 'super_admin' || hasFeature('tenant-admin')) && (
                  <Route path="/admin" element={<TenantAdmin />} />
                )}
                {user?.role === 'super_admin' && <Route path="/super-admin" element={<SuperAdmin />} />}
                {user?.role === 'super_admin' && <Route path="/messages" element={<Messages />} />}
                {user?.role === 'super_admin' && <Route path="/stats-logs" element={<StatsLogs />} />}
                {hasFeature('production') && <Route path="/labor-production" element={<LaborProduction />} />}
                {hasFeature('time-entry') && <Route path="/time-entry" element={<TimeEntry />} />}
                {hasFeature('employees') && <Route path="/employees" element={<EmployeeManagement />} />}
                {hasFeature('time-approval') && <Route path="/time-approval" element={<TimeApproval />} />}

                {/* Booking module */}
                {hasFeature('booking-dashboard') && <Route path="/bookings" element={<BookingDashboardPage />} />}
                {hasFeature('new-booking') && <Route path="/bookings/new" element={<NewBookingPage />} />}
                {hasFeature('bookings') && <Route path="/bookings/list" element={<BookingsPage />} />}
                {hasFeature('bookings') && <Route path="/bookings/:id" element={<BookingDetailPage />} />}
                {hasFeature('booking-customers') && <Route path="/bookings/clients" element={<BookingCustomersPage />} />}
                {hasFeature('booking-payments') && <Route path="/bookings/payments" element={<BookingPaymentsPage />} />}
                {hasFeature('booking-reminders') && <Route path="/bookings/reminders" element={<BookingRemindersPage />} />}
                {hasFeature('booking-sms-usage') && <Route path="/bookings/sms-usage" element={<BookingSmsUsagePage />} />}
                {hasFeature('booking-integration') && <Route path="/bookings/integration" element={<BookingIntegrationPage />} />}

                {/* Time entry simple accessible for testing */}
                <Route path="/time-entry-simple" element={<TimeEntrySimple />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </div>
  )
}




