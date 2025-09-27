import { useState, useEffect } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
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

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [userName, setUserName] = useState('')

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
  }, 3000)

  return () => clearTimeout(timer)
}, [])

// Add this separate useEffect to log userName changes
useEffect(() => {
  console.log('userName state updated to:', userName)
}, [userName])

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
              Welcome {userName}
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
          <NavLink to="/" end className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Dashboard" onClick={() => setNavOpen(false)}>D</NavLink>
          <NavLink to="/orders/new" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="New Order" onClick={() => setNavOpen(false)}>O</NavLink>
          <NavLink to="/payments" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Payments" onClick={() => setNavOpen(false)}>P</NavLink>
          <NavLink to="/customers" className={({isActive}) => `icon-btn ${isActive ? 'active' : ''}`} title="Customers" onClick={() => setNavOpen(false)}>C</NavLink>
        </div>
      </header>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className="layout">
        <nav className={`nav ${navOpen ? 'open' : ''}`}>
          <NavLink to="/" end onClick={() => setNavOpen(false)}>Dashboard</NavLink>
          <NavLink to="/customers" onClick={() => setNavOpen(false)}>Customers</NavLink>
          <NavLink to="/partners" onClick={() => setNavOpen(false)}>Partners</NavLink>
          <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>New Order</NavLink>
          <NavLink to="/payments" onClick={() => setNavOpen(false)}>New Payment</NavLink>
          <NavLink to="/products/new" onClick={() => setNavOpen(false)}>New Product</NavLink>
          
          <NavLink to="/settings" onClick={() => setNavOpen(false)}>Settings</NavLink>
        </nav>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders/new" element={<NewOrder />} />
            <Route path="/payments" element={<Payments />} />
            {/* ⬇️ NEW routes */}
            <Route path="/products/new" element={<NewProduct />} />
            <Route path="/products/edit" element={<EditProduct />} />
            <Route path="/customers" element={<Customers />} />
            {/* not in side-nav */}
            <Route path="/customers/new" element={<CreateCustomer />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/customers/:id/edit" element={<EditCustomer />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/partners/new" element={<CreatePartner />} />
            <Route path="/partners/:id" element={<PartnerDetail />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}




