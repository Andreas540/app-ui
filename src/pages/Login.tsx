// src/pages/Login.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await handleLogin()
    } catch (err) {
      console.error('Login error:', err)
      setError(t('login.errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('login.errorRequired'))
      return
    }

    try {
      const response = await fetch('/.netlify/functions/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || t('login.errorFailed'))
        return
      }

      // Use auth context to store token and user data
      login(data.token, data.user)

      // Replace so /login doesn't stay in browser history — prevents blank screen on back navigation
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Login error:', err)
      setError(t('login.errorRetry'))
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'var(--bg)'
    }}>
      <div className="card page-xnarrow" style={{ width: '100%', margin: '0 16px' }}>
        <h3 style={{ textAlign: 'center', marginBottom: 24 }}>
          {t('login.heading')}
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              placeholder={t('login.emailPlaceholder')}
              autoFocus
              style={{ marginTop: 4 }}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label>{t('login.passwordLabel')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder={t('login.passwordPlaceholder')}
              style={{ marginTop: 4 }}
              disabled={loading}
            />
          </div>

          {error && (
            <div style={{ 
              color: '#ff6b6b', 
              fontSize: 14, 
              marginBottom: 16,
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="primary" 
            style={{ width: '100%', marginTop: 8 }}
            disabled={loading || !email.trim() || !password.trim()}
          >
            {loading ? t('login.loading') : t('login.button')}
          </button>
        </form>
      </div>
    </div>
  )
}