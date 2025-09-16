import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NewOrder from './pages/NewOrder'
import Customers from './pages/Customers'
import Settings from './pages/Settings'
import Payments from './pages/Payments.tsx'
import CreateCustomer from './pages/CreateCustomer.tsx' // button target (not in nav)

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
          <div className="brand-title">App UI (Prototype)</div>
        </div>
      </header>

      {/* Mobile backdrop when nav is open */}
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className="layout">
        <nav className={`nav ${navOpen ? 'open' : ''}`}>
          <NavLink to="/" end onClick={() => setNavOpen(false)}>Dashboard</NavLink>
          <NavLink to="/orders/new" onClick={() => setNavOpen(false)}>New Order</NavLink>
          <NavLink to="/payments" onClick={() => setNavOpen(false)}>Payments</NavLink>
          <NavLink to="/customers" onClick={() => setNavOpen(false)}>Customers</NavLink>
          <NavLink to="/settings" onClick={() => setNavOpen(false)}>Settings</NavLink>
        </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<CreateCustomer />} /> {/* not in nav */}
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      </div>
    </div>
  )
}
