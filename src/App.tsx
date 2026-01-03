import { useState, useEffect } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
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
import CreateUser from './pages/CreateUser'
import EditSupplier from './pages/EditSupplier'
import SuperAdmin from './pages/SuperAdmin'
import DashboardStore from './pages/DashboardStore'
import LaborProduction from './pages/LaborProduction'
import TimeEntry from './pages/TimeEntry'
import EmployeeManagement from './pages/EmployeeManagement'
import TimeApproval from './pages/TimeApproval'
import TimeEntrySimple from './pages/TimeEntrySimple'

export default function App() {
  // ✅ Bypass login for employee token link to:
  //   /time-entry/:token
  //   /time-entry-simple/:token
  const isEmployeeTokenTimeEntry = (() => {
    try {
      const path = window.location.pathname.replace(/\/+$/, '')
      const parts = path.split('/').filter(Boolean)

      const isSimple = parts[0] === 'time-entry-simple' && !!parts[1]
      const isFull = parts[0] === 'time-entry' && !!parts[1]

      return isSimple || isFull
    } catch (e) {
      console.error('❌ Employee token check error:', e)
      return false
    }
  })()

  if (isEmployeeTokenTimeEntry) {
    // Render only the time-entry route (no nav, no login required)
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
        <main
          className="content"
          style={{
            padding: 16,
            minHeight: '100%',
          }}
        >
          <Routes>
            <Route path="/time-entry/:token" element={<TimeEntry />} />
            <Route path="/time-entry-simple/:token" element={<TimeEntrySimple />} />
          </Routes>
        </main>
      </div>
    )
  }

  const [navOpen, setNavOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [userName, setUserName] = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(['D', 'O', 'P', 'C'])

  // Multi-tenant state
  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(localStorage.getItem('activeTenantId'))

  // New auth system
  const { isAuthenticated, user, logout: authLogout } = useAuth()

  // Legacy auth system (for BLV)
  const [legacyUserLevel, setLegacyUserLevel] = useState<'admin' | 'inventory' | null>(
    (localStorage.getItem('userLevel') as 'admin' | 'inventory') || null
  )

  // Determine if user is authenticated (either new or legacy)
  const isLoggedIn = isAuthenticated || legacyUserLevel !== null

  // Determine user level (for access control)
  const userLevel = user?.accessLevel || legacyUserLevel || 'admin'

  // Handle logout
  const handleLogout = () => {
    try {
      authLogout()
    } catch {}

    setLegacyUserLevel(null)
    localStorage.removeItem('userLevel')

    localStorage.removeItem('authToken')
    localStorage.removeItem('activeTenantId')

    location.href = '/login'
  }

  // Load user settings
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
    } catch (error) {
      console.log('Error loading settings:', error)
      setUserName('User')
    }

    const timer = setTimeout(() => {
      setShowWelcome(false)
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  // Load user's available tenants
  useEffect(() => {
    if (!isAuthenticated || !user) return

    const loadTenants = async () => {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const token = localStorage.getItem('authToken')

        const res = await fetch(`${base}/api/user-tenants`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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

  // Show login screen if not authenticated
  if (!isLoggedIn) {
    return <Login />
  }

  // Tenant switching handler
  const handleTenantSwitch = async () => {
    if (availableTenants.length <= 1) return

    const currentIndex = availableTenants.findIndex(t => t.id === activeTenantId)
    const nextIndex = (currentIndex + 1) % availableTenants.length
    const nextTenant = availableTenants[nextIndex]

    localStorage.setItem('activeTenantId', nextTenant.id)

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
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
        if (data.user) {
          localStorage.setItem('userData', JSON.stringify(data.user))
        }
      }
    } catch (e) {
      console.error('Failed to refresh user data:', e)
    }

    window.location.reload()
  }

  // Get current tenant name for display
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
          {userLevel === 'inventory' ? (
            selectedShortcuts.includes('I') && (
              <NavLink
                to="/inventory"
                className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                title="Inventory"
                onClick={() => setNavOpen(false)}
              >
                I
              </NavLink>
            )
          ) : user?.businessType === 'physical_store' ? null : (
            <>
              {selectedShortcuts.includes('D') && (
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
              {selectedShortcuts.includes('O') && (
                <NavLink
                  to="/orders/new"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="New Order"
                  onClick={() => setNavOpen(false)}
                >
                  O
                </NavLink>
              )}
              {selectedShortcuts.includes('P') && (
                <NavLink
                  to="/payments"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="Payments"
                  onClick={() => setNavOpen(false)}
                >
                  P
                </NavLink>
              )}
              {selectedShortcuts.includes('C') && (
                <NavLink
                  to="/customers"
                  className={({ isActive }) => `icon-btn ${isActive ? 'active' : ''}`}
                  title="Customers"
                  onClick={() => setNavOpen(false)}
                >
                  C
                </NavLink>
              )}
              {selectedShortcuts.includes('I') && (
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
          {userLevel === 'inventory' ? (
            <>
              <NavLink to="/inventory" onClick={() => setNavOpen(false)}>
                Inventory Dashboard
              </NavLink>
              <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                Settings
              </NavLink>
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
          ) : user?.businessType === 'physical_store' ? (
            <>
              <NavLink to="/" onClick={() => setNavOpen(false)}>
                Store Dashboard
              </NavLink>
              <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                Settings
              </NavLink>
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
              <NavLink to="/" end onClick={() => setNavOpen(false)}>
                Main Dashboard
              </NavLink>
              <NavLink to="/customers" onClick={() => setNavOpen(false)}>
                Customers
              </NavLink>
              <NavLink to="/partners" onClick={() => setNavOpen(false)}>
                Partners
              </NavLink>
              <NavLink to="/price-checker" onClick={() => setNavOpen(false)}>
                Price Checker
              </NavLink>
              <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>
                New Order
              </NavLink>
              <NavLink to="/payments" onClick={() => setNavOpen(false)}>
                New Payment
              </NavLink>
              <NavLink to="/products/new" onClick={() => setNavOpen(false)}>
                Products
              </NavLink>
              <NavLink to="/invoices/create" onClick={() => setNavOpen(false)}>
                Create Invoice
              </NavLink>

              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Inventory</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              <NavLink to="/supply-chain" onClick={() => setNavOpen(false)}>
                Supply & Demand
              </NavLink>
              <NavLink to="/suppliers" end onClick={() => setNavOpen(false)}>
                Suppliers
              </NavLink>
              <NavLink to="/supplier-orders/new" onClick={() => setNavOpen(false)}>
                New Order (S)
              </NavLink>
              <NavLink to="/warehouse" onClick={() => setNavOpen(false)}>
                Warehouse
              </NavLink>

              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Other</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              <NavLink to="/labor-production" onClick={() => setNavOpen(false)}>
                Production
              </NavLink>
              <NavLink to="/time-entry" onClick={() => setNavOpen(false)}>
                Time Entry
              </NavLink>
              <NavLink to="/employees" onClick={() => setNavOpen(false)}>
                Employees
              </NavLink>
              <NavLink to="/time-approval" onClick={() => setNavOpen(false)}>
                Time Approval
              </NavLink>
              <NavLink to="/costs/new" onClick={() => setNavOpen(false)}>
                New Cost
              </NavLink>

              {user?.role === 'super_admin' && (
                <NavLink to="/super-admin" onClick={() => setNavOpen(false)}>
                  Super Admin
                </NavLink>
              )}

              <NavLink to="/settings" onClick={() => setNavOpen(false)}>
                Settings
              </NavLink>

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
            {userLevel === 'inventory' ? (
              <>
                <Route path="/" element={<InventoryDashboard />} />
                <Route path="/inventory" element={<InventoryDashboard />} />
                <Route path="/settings" element={<Settings />} />
              </>
            ) : user?.businessType === 'physical_store' ? (
              <>
                <Route path="/" element={<DashboardStore />} />
                <Route path="/settings" element={<Settings />} />
              </>
            ) : (
              <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders/new" element={<NewOrder />} />
                <Route path="/orders/:orderId/edit" element={<EditOrder />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/products/new" element={<NewProduct />} />
                <Route path="/products/edit" element={<EditProduct />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/new" element={<CreateCustomer />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/customers/:id/edit" element={<EditCustomer />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/partners" element={<Partners />} />
                <Route path="/partners/new" element={<CreatePartner />} />
                <Route path="/partners/:id" element={<PartnerDetail />} />
                <Route path="/partners/:id/edit" element={<EditPartner />} />
                <Route path="/inventory" element={<InventoryDashboard />} />
                <Route path="/payments/:paymentId/edit" element={<EditPayment />} />
                <Route path="/invoices/create" element={<CreateInvoicePage />} />
                <Route path="/invoices/preview" element={<InvoicePreview />} />
                <Route path="/price-checker" element={<PriceChecker />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/suppliers/new" element={<CreateSupplier />} />
                <Route path="/supplier-orders/new" element={<NewOrderSupplier />} />
                <Route path="/suppliers/:id" element={<SupplierDetail />} />
                <Route path="/supplier-orders/:id/edit" element={<EditOrderSupplier />} />
                <Route path="/costs/new" element={<NewCost />} />
                <Route path="/warehouse" element={<Warehouse />} />
                <Route path="/supply-chain" element={<SupplyChainOverview />} />
                <Route path="/admin" element={<TenantAdmin />} />
                <Route path="/admin/create-user" element={<CreateUser />} />
                <Route path="/suppliers/:id/edit" element={<EditSupplier />} />
                <Route path="/super-admin" element={<SuperAdmin />} />
                <Route path="/labor-production" element={<LaborProduction />} />
                <Route path="/time-entry" element={<TimeEntry />} />
                <Route path="/employees" element={<EmployeeManagement />} />
                <Route path="/time-approval" element={<TimeApproval />} />

                {/* Optional: allow admin to open the page (without token) */}
                <Route path="/time-entry-simple" element={<TimeEntrySimple />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </div>
  )
}
