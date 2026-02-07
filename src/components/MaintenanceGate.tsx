import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const MAINTENANCE_URL = '/maintenance.html'

// If you want a toggle, set window.__MAINTENANCE__ from index.html,
// or use an env var like import.meta.env.VITE_MAINTENANCE === '1'.
// For now, we’ll detect maintenance by pinging a URL that will redirect.
async function shouldKickOut(): Promise<boolean> {
  try {
    // This should be affected by your Netlify redirect.
    // Use a URL that always exists in your app.
    const res = await fetch('/api/bootstrap', { method: 'GET', cache: 'no-store' })

    // If Netlify is redirecting, fetch often returns 200 with redirected=true (browser dependent),
    // but redirected is the key signal.
    if (res.redirected) return true

    // If backend blocks auth during maintenance/disabled state
    if (res.status === 401 || res.status === 403) return true

    return false
  } catch {
    // If network is blocked/down, treat it as maintenance
    return true
  }
}

export default function MaintenanceGate() {
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const kick = await shouldKickOut()
      if (cancelled) return
      if (kick) {
        // Hard redirect: leaves SPA immediately
        window.location.replace(MAINTENANCE_URL)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search])

  return null
}