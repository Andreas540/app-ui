// src/App.tsx
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'

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
import InventoryDashboard from './pages/InventoryDashboard'
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

function MainApp() {
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [userName, setUserName] = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(['D', 'O', 'P', 'C'])

  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(localStorage.getItem('activeTenantId'))

  const { isAuthenticated, user, logout: authLogout, hasFeature } = useAuth()

  const [legacyUserLevel, setLegacyUserLevel] = useState<'admin' | 'inventory' | null>(
    (localStorage.getItem('userLevel') as 'admin' | 'inventory') || null
  )

  const isLoggedIn = isAuthenticated || legacyUserLevel !== null

  const handleLogout = () => {
    try {
      authLogout()
    } catch {}

    setLegacyUserLevel(null)
    localStorage.removeItem('userLevel')
    localStorage.removeItem('authToken')
    localStorage.removeItem('activeTenantId')

    window.location.href = '/login'
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('userSettings')
      if (saved) {
        const settings = JSON.parse(saved)
        const loadedName = settings.userName || 'User'
        setUserName(loadedName)
        setSelectedShortcuts(settings.selectedShortcuts || ['D', 'O', 'P', 'C'])
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
            setActiveTenantId(data.tenants[0].id)
            localStorage.setItem('activeTenantId', data.tenants[0].id)
          }
        }
      } catch (e) {
        console.error('Failed to load tenants:', e)
      }
    }

    loadTenants()
  }, [isAuthenticated, user])

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
  const currentTenantName = currentTenant?.name || user?.tenantName || 'BLV App'

  return (
    <div className="app">
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
              Welcome {userName}!
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
          {user?.businessType === 'physical_store' ? null : (
            <>
              {selectedShortcuts.includes('D') && hasFeature('dashboard') && (
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="Dashboard"
                  onClick={() => setNavOpen(false)}
                >
                  D
                </NavLink>
              )}
              {selectedShortcuts.includes('O') && hasFeature('orders') && (
                <NavLink
                  to="/orders/new"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="New Order"
                  onClick={() => setNavOpen(false)}
                >
                  O
                </NavLink>
              )}
              {selectedShortcuts.includes('P') && hasFeature('payments') && (
                <NavLink
                  to="/payments"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="Payments"
                  onClick={() => setNavOpen(false)}
                >
                  P
                </NavLink>
              )}
              {selectedShortcuts.includes('C') && hasFeature('customers') && (
                <NavLink
                  to="/customers"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="Customers"
                  onClick={() => setNavOpen(false)}
                >
                  C
                </NavLink>
              )}
              {selectedShortcuts.includes('I') && hasFeature('inventory') && (
                <NavLink
                  to="/inventory"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="Inventory"
                  onClick={() => setNavOpen(false)}
                >
                  I
                </NavLink>
              )}
            </>
          )}
        </div>
      </header>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className="layout">
        <nav className={`nav ${navOpen ? 'open' : ''}`}>
          {user?.businessType === 'physical_store' ? (
            <>
              {hasFeature('dashboard') && (
                <NavLink to="/" onClick={() => setNavOpen(false)}>
                  Store Dashboard
                </NavLink>
              )}
              {hasFeature('settings') && (
                <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                  Settings
                </NavLink>
              )}
              <button
                onClick={handleLogout}
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
                Logout
              </button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 8, marginBottom: 4 }}>Sales</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              {hasFeature('dashboard') && (
                <NavLink to="/" end onClick={() => setNavOpen(false)}>
                  Main Dashboard
                </NavLink>
              )}
              {hasFeature('customers') && (
                <NavLink to="/customers" onClick={() => setNavOpen(false)}>
                  Customers
                </NavLink>
              )}
              {hasFeature('partners') && (
                <NavLink to="/partners" onClick={() => setNavOpen(false)}>
                  Partners
                </NavLink>
              )}
              {hasFeature('price-checker') && (
                <NavLink to="/price-checker" onClick={() => setNavOpen(false)}>
                  Price Checker
                </NavLink>
              )}
              {hasFeature('orders') && (
                <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>
                  New Order
                </NavLink>
              )}
              {hasFeature('payments') && (
                <NavLink to="/payments" onClick={() => setNavOpen(false)}>
                  New Payment
                </NavLink>
              )}
              {hasFeature('products') && (
                <NavLink to="/products/new" onClick={() => setNavOpen(false)}>
                  Products
                </NavLink>
              )}
              {hasFeature('invoices') && (
                <NavLink to="/invoices/create" onClick={() => setNavOpen(false)}>
                  Create Invoice
                </NavLink>
              )}

              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Inventory</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              {hasFeature('supply-chain') && (
                <NavLink to="/supply-chain" onClick={() => setNavOpen(false)}>
                  Supply & Demand
                </NavLink>
              )}
              {hasFeature('suppliers') && (
                <NavLink to="/suppliers" end onClick={() => setNavOpen(false)}>
                  Suppliers
                </NavLink>
              )}
              {hasFeature('supplier-orders') && (
                <NavLink to="/supplier-orders/new" onClick={() => setNavOpen(false)}>
                  New Order (S)
                </NavLink>
              )}
              {hasFeature('warehouse') && (
                <NavLink to="/warehouse" onClick={() => setNavOpen(false)}>
                  Warehouse
                </NavLink>
              )}

              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Other</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              {hasFeature('production') && (
                <NavLink to="/labor-production" onClick={() => setNavOpen(false)}>
                  Production
                </NavLink>
              )}
              {hasFeature('time-entry') && (
                <NavLink to="/time-entry" onClick={() => setNavOpen(false)}>
                  Time Entry
                </NavLink>
              )}
              {hasFeature('employees') && (
                <NavLink to="/employees" onClick={() => setNavOpen(false)}>
                  Employees
                </NavLink>
              )}
              {hasFeature('time-approval') && (
                <NavLink to="/time-approval" onClick={() => setNavOpen(false)}>
                  Time Approval
                </NavLink>
              )}
              {hasFeature('costs') && (
                <NavLink to="/costs/new" onClick={() => setNavOpen(false)}>
                  New Cost
                </NavLink>
              )}

              {user?.role === 'super_admin' && (
                <NavLink to="/super-admin" onClick={() => setNavOpen(false)}>
                  Super Admin
                </NavLink>
              )}

              {(user?.role === 'tenant_admin' || user?.role === 'super_admin' || hasFeature('tenant-admin')) && (
                <NavLink to="/admin" onClick={() => setNavOpen(false)}>
                  Tenant Admin
                </NavLink>
              )}

              {hasFeature('settings') && (
                <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                  Settings
                </NavLink>
              )}

              <button
                onClick={handleLogout}
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
                Logout
              </button>
            </>
          )}
        </nav>

        <main className="content">
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
                {hasFeature('partners') && (
                  <>
                    <Route path="/partners" element={<Partners />} />
                    <Route path="/partners/new" element={<CreatePartner />} />
                    <Route path="/partners/:id" element={<PartnerDetail />} />
                    <Route path="/partners/:id/edit" element={<EditPartner />} />
                  </>
                )}
                {hasFeature('inventory') && <Route path="/inventory" element={<InventoryDashboard />} />}
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
                {hasFeature('warehouse') && <Route path="/warehouse" element={<Warehouse />} />}
                {hasFeature('supply-chain') && <Route path="/supply-chain" element={<SupplyChainOverview />} />}
                {(user?.role === 'tenant_admin' || user?.role === 'super_admin' || hasFeature('tenant-admin')) && (
                  <Route path="/admin" element={<TenantAdmin />} />
                )}
                {user?.role === 'super_admin' && <Route path="/super-admin" element={<SuperAdmin />} />}
                {hasFeature('production') && <Route path="/labor-production" element={<LaborProduction />} />}
                {hasFeature('time-entry') && <Route path="/time-entry" element={<TimeEntry />} />}
                {hasFeature('employees') && <Route path="/employees" element={<EmployeeManagement />} />}
                {hasFeature('time-approval') && <Route path="/time-approval" element={<TimeApproval />} />}
                
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




