// src/components/MaintenanceGate.tsx
import { useEffect } from 'react'

const MAINTENANCE_URL = '/maintenance.html'

// 🔴 TURN THIS ON TO KILL THE APP
const MAINTENANCE_MODE = true

export default function MaintenanceGate() {
  useEffect(() => {
    if (!MAINTENANCE_MODE) return

    // Avoid infinite loop if someone opens maintenance.html directly
    if (window.location.pathname === MAINTENANCE_URL) return

    // Hard redirect: immediately leave the SPA
    window.location.replace(MAINTENANCE_URL)
  }, [])

  return null
}