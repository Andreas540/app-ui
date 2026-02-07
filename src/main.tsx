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

// 🚨 Disable PWA / Service Worker (maintenance mode)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister())
    })
  })
}

