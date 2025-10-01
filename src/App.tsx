import { useState, useEffect } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NewOrder from './pages/NewOrder'
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

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [userName, setUserName] = useState('')
  const [selectedShortcuts, setSelectedShortcuts] = useState<string[]>(['D', 'O', 'P', 'C'])
  const [userLevel, setUserLevel] = useState<'admin' | 'inventory' | null>(
    localStorage.getItem('userLevel') as 'admin' | 'inventory' || null
  )
  const navigate = useNavigate()

  // Handle login
  const handleLogin = (level: 'admin' | 'inventory') => {
    setUserLevel(level)
    localStorage.setItem('userLevel', level)
    setNavOpen(false)
    
    // Use React Router navigation (safer than window.location)
    setTimeout(() => {
      if (level === 'inventory') {
        navigate('/inventory', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    }, 0)
  }

  // Handle logout
  const handleLogout = () => {
    setUserLevel(null)
    localStorage.removeItem('userLevel')
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('userSettings')
      console.log('Raw saved data:', saved)
      if (saved) {
        const settings = JSON.parse(saved)
        console.log('Parsed settings:', settings)
        const loadedName = settings.userName || 'User'
        console.log('Setting userName to:', loadedName)
        setUserName(loadedName)
        setSelectedShortcuts(settings.selectedShortcuts || ['D', 'O', 'P', 'C'])
      } else {
        console.log('No saved settings, using default')
        setUserName('User')
      }
    } catch (error) {
      console.log('Error loading settings:', error)
      setUserName('User')
    }

    // Timer for animation
    const timer = setTimeout(() => {
      console.log('Timer fired, hiding welcome')
      setShowWelcome(false)
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  // Add this separate useEffect to log userName changes
  useEffect(() => {
    console.log('userName state updated to:', userName)
  }, [userName])

  console.log('About to render - showWelcome:', showWelcome, 'userName:', userName)

  // Show login screen if not authenticated
  if (!userLevel) {
    return <Login onLogin={handleLogin} />
  }

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
          <div className="brand-title" style={{ position: 'relative', overflow: 'hidden', height: '1.2em' }}>
            <div 
              style={{
                transform: showWelcome ? 'translateY(0)' : 'translateY(-100%)',
                transition: 'transform 0.6s ease-in-out',
                position: 'absolute',
                width: '100%'
              }}
            >
              Welcome {userName}!
            </div>
            <div 
              style={{
                transform: showWelcome ? 'translateY(100%)' : 'translateY(0)',
                transition: 'transform 0.6s ease-in-out',
                position: 'absolute',
                width: '100%'
              }}
            >
              BLV App
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
              <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>New Order</NavLink>
              <NavLink to="/payments" onClick={() => setNavOpen(false)}>New Payment</NavLink>
              
              {/* Inventory Section */}
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Inventory</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
              <NavLink to="/products/new" onClick={() => setNavOpen(false)}>New Product</NavLink>
              <NavLink to="/inventory" onClick={() => setNavOpen(false)}>Inventory Dashboard</NavLink>
              
              {/* Other Section */}
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginTop: 16, marginBottom: 4 }}>Other</div>
              <div style={{ height: 1, background: '#fff', opacity: 0.3, marginBottom: 8 }} />
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
              </>
            )}
          </Routes>
        </main>
      </div>
    </div>
  )
}