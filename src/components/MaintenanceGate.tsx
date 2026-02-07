// src/components/MaintenanceGate.tsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const MAINTENANCE_URL = '/maintenance.html'

// 🔴 TURN THIS ON TO KILL THE APP
export const MAINTENANCE_MODE = true

function kickToMaintenance() {
  // Avoid infinite loop
  if (window.location.pathname === MAINTENANCE_URL) return
  
  // Clear auth data
  try {
    localStorage.removeItem('authToken')
    localStorage.removeItem('activeTenantId')
    sessionStorage.clear()
  } catch {}
  
  // Hard redirect out of SPA
  window.location.replace(MAINTENANCE_URL)
}

export default function MaintenanceGate() {
  const location = useLocation()
  
  // Check on mount AND every route change
  useEffect(() => {
    if (MAINTENANCE_MODE) {
      kickToMaintenance()
    }
  }, [location.pathname]) // Re-check on every navigation
  
  return null
}