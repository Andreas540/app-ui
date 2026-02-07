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

// 🚨 Disable PWA / Service Worker and immediately redirect to maintenance
if ('serviceWorker' in navigator) {
  ;(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
    // Kick out this running SPA session
    window.location.replace('/maintenance.html')
  })()
} else {
  // No SW support — still kick out
  window.location.replace('/maintenance.html')
}

