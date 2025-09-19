import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NewOrder from './pages/NewOrder'
import Customers from './pages/Customers'
import Settings from './pages/Settings'
import Payments from './pages/Payments'
import CreateCustomer from './pages/CreateCustomer'
import CustomerDetail from './pages/CustomerDetail'
import EditCustomer from './pages/EditCustomer'

// ⬇️ NEW
import NewProduct from './pages/NewProduct'
import EditProduct from './pages/EditProduct'

export default function App() {
  const [navOpen, setNavOpen] = useState(false)

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
          <div className="brand-title">BLV App</div>
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
          <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>New Order</NavLink>
          <NavLink to="/payments" onClick={() => setNavOpen(false)}>Payments</NavLink>
          {/* ⬇️ NEW — visible in menu, no quick button */}
          <NavLink to="/products/new" onClick={() => setNavOpen(false)}>New Product</NavLink>
          <NavLink to="/customers" onClick={() => setNavOpen(false)}>Customers</NavLink>
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
          </Routes>
        </main>
      </div>
    </div>
  )
}




