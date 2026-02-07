// src/components/MaintenanceGate.tsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const MAINTENANCE_URL = '/maintenance.html'

// This component is now just a safety net
// The REAL kill switch is in the backend (netlify functions)
export default function MaintenanceGate() {
  const location = useLocation()
  
  useEffect(() => {
    // Check if we're already on maintenance page
    if (window.location.pathname === MAINTENANCE_URL) return
    
    // Backend will return 503 and api.ts will handle the redirect
    // This is just a safety net
  }, [location.pathname])
  
  return null
}