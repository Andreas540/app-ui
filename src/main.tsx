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

// 🚨 Disable PWA / Service Worker and force redirect to maintenance
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    const hadAny = regs.length > 0

    await Promise.all(regs.map((r) => r.unregister()))

    // Force a reload/redirect so the in-memory SPA can't keep running
    if (hadAny) {
      window.location.replace('/maintenance.html')
    }
  })
}

