// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { LocaleProvider } from './contexts/LocaleContext.tsx'
import App from './App.tsx'
import './styles.css'
import './i18n/config'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)

// 🧹 Clean up service worker (runs once per session)
if ('serviceWorker' in navigator) {
  // Check if we already cleaned up this session
  const hasCleanedSW = sessionStorage.getItem('sw_cleanup_done')
  
  if (!hasCleanedSW) {
    ;(async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
        sessionStorage.setItem('sw_cleanup_done', '1')
        console.log('Service worker cleaned up')
      } catch (err) {
        console.error('Failed to unregister service workers:', err)
      }
    })()
  }
}

