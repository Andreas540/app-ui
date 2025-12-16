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

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [userName, setUserName] = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(['D', 'O', 'P', 'C'])
  
  // New auth system
  const { isAuthenticated, user, logout: authLogout } = useAuth()
  
  // Legacy auth system (for BLV)
  const [legacyUserLevel, setLegacyUserLevel] = useState<'admin' | 'inventory' | null>(
    localStorage.getItem('userLevel') as 'admin' | 'inventory' || null
  )

  // Determine if user is authenticated (either new or legacy)
  const isLoggedIn = isAuthenticated || legacyUserLevel !== null
  
  // Determine user level (for access control)
  const userLevel = user?.accessLevel || legacyUserLevel || 'admin'

  // Handle logout
    const handleLogout = () => {
    // New auth (your AuthContext may already do this, but we make it deterministic)
    try { authLogout() } catch {}

    // Legacy auth
    setLegacyUserLevel(null)
    localStorage.removeItem('userLevel')

    // Hard guarantee: remove JWT used by resolveAuthz() identity
    localStorage.removeItem('authToken')

    // Wipe any other cached auth artifacts if you ever introduced them
    // localStorage.removeItem('tenantId') // only if it exists in your app
    // localStorage.removeItem('role')     // only if it exists in your app

    // Hard reload to clear in-memory state
    location.href = '/login'
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
    } catch (error) {
      console.log('Error loading settings:', error)
      setUserName('User')
    }

    // Timer for animation
    const timer = setTimeout(() => {
      setShowWelcome(false)
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  // Show login screen if not authenticated
  if (!isLoggedIn) {
    return <Login />
  }

  // Show tenant name in header for authenticated users
  const displayName = user?.tenantName 
    ? `${userName} (${user.tenantName})` 
    : userName

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button
            className="hamburger"
            aria-label="Toggle menu"
            onClick={() => setNavOpen(v => !v)}
          >
            <span></span><span></span><span></span>
          </button>
          <div className="brand-title">
            <div 
              style={{
                transform: showWelcome ? 'translateY(0)' : 'translateY(-100%)',
                transition: 'transform 0.6s ease-in-out',
                position: 'absolute',
                width: '100%'
              }}
            >
              Welcome {displayName}!
            </div>
            <div 
              style={{
                transform: showWelcome ? 'translateY(100%)' : 'translateY(0)',
                transition: 'transform 0.6s ease-in-out',
                position: 'absolute',
                width: '100%'
              }}
            >
              {user?.tenantName || 'BLV App'}
            </div>
          </div>
        </div>

        <div className="quick-buttons" aria-label="Quick navigation">
          {userLevel === 'inventory' ? (
            // Inventory users only see inventory button if they selected it
            selectedShortcuts.includes('I') && (
              <NavLink to="/inventory" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Inventory" onClick={() => setNavOpen(false)}>I</NavLink>
            )
          ) : (
            // Admin sees their selected shortcuts
            <>
              {selectedShortcuts.includes('D') && <NavLink to="/" end className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Dashboard" onClick={() => setNavOpen(false)}>D</NavLink>}
              {selectedShortcuts.includes('O') && <NavLink to="/orders/new" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="New Order" onClick={() => setNavOpen(false)}>O</NavLink>}
              {selectedShortcuts.includes('P') && <NavLink to="/payments" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Payments" onClick={() => setNavOpen(false)}>P</NavLink>}
              {selectedShortcuts.includes('C') && <NavLink to="/customers" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Customers" onClick={() => setNavOpen(false)}>C</NavLink>}
              {selectedShortcuts.includes('I') && <NavLink to="/inventory" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Inventory" onClick={() => setNavOpen(false)}>I</NavLink>}
            </>
          )}
        </div>
      </header>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className="layout">
        <nav className={`nav ${navOpen ? 'open' : ''}`}>
          {/* Inventory users see inventory navigation + settings + logout */}
          {userLevel === 'inventory' ? (
            <>
              <NavLink to="/inventory" onClick={() => setNavOpen(false)}>Inventory Dashboard</NavLink>
              <NavLink to="/settings" onClick={() => setNavOpen(false)}>Settings</NavLink>
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
                  width: '75%'
                }}
              >
                Logout
              </button>
            </>
          ) : (
            /* Admin sees everything with sections */
            <>
              {/* Sales Section */}
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 8, marginBottom: 4 }}>Sales</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              <NavLink to="/" end onClick={() => setNavOpen(false)}>Main Dashboard</NavLink>
              <NavLink to="/customers" onClick={() => setNavOpen(false)}>Customers</NavLink>
              <NavLink to="/partners" onClick={() => setNavOpen(false)}>Partners</NavLink>
              <NavLink to="/price-checker" onClick={() => setNavOpen(false)}>Price Checker</NavLink>
              <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>New Order</NavLink>
              <NavLink to="/payments" onClick={() => setNavOpen(false)}>New Payment</NavLink>
              <NavLink to="/products/new" onClick={() => setNavOpen(false)}>Products</NavLink>
              <NavLink to="/invoices/create" onClick={() => setNavOpen(false)}>Create Invoice</NavLink>
              
              {/* Inventory Section */}
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Inventory</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />            
              <NavLink to="/supply-chain" onClick={() => setNavOpen(false)}>Supply & Demand</NavLink>
              <NavLink to="/suppliers" end onClick={() => setNavOpen(false)}>Suppliers</NavLink>
              <NavLink to="/supplier-orders/new" onClick={() => setNavOpen(false)}>New Order (S)</NavLink>
              <NavLink to="/warehouse" onClick={() => setNavOpen(false)}>Warehouse</NavLink>
              
              {/* Other Section */}
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Other</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              <NavLink to="/costs/new" onClick={() => setNavOpen(false)}>New Cost</NavLink>
              
              {/* Show admin link only for super admins */}
              {user?.role === 'super_admin' && (
                <NavLink to="/admin" onClick={() => setNavOpen(false)}>Tenant Admin</NavLink>
              )}
              
              <NavLink to="/settings" onClick={() => setNavOpen(false)}>Settings</NavLink>
              
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
                  width: '75%'
                }}
              >
                Logout
              </button>
            </>
          )}
        </nav>

        <main className="content">
          <Routes>
            {/* Inventory users see inventory routes + settings */}
            {userLevel === 'inventory' ? (
              <>
                <Route path="/" element={<InventoryDashboard />} />
                <Route path="/inventory" element={<InventoryDashboard />} />
                <Route path="/settings" element={<Settings />} />
              </>
            ) : (
              /* Admin sees all routes */
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
              </>
            )}
          </Routes>
        </main>
      </div>
    </div>
  )
}