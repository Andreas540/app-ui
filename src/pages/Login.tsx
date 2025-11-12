import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useEmailLogin, setUseEmailLogin] = useState(false)
  
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (useEmailLogin) {
        // NEW: Database authentication with email/password
        await handleDatabaseLogin()
      } else {
        // OLD: Legacy BLV hardcoded password authentication
        handleLegacyLogin()
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  const handleDatabaseLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password required')
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
        setError(data.error || 'Login failed')
        return
      }

      // Use auth context to store token and user data
      login(data.token, data.user)

      // Navigate based on role
      if (data.user.role === 'super_admin') {
        navigate('/control-panel') // Will create this page later
      } else if (data.user.accessLevel === 'inventory') {
        navigate('/inventory')
      } else {
        navigate('/')
      }
    } catch (err) {
      console.error('Database login error:', err)
      setError('Login failed. Please try again.')
    }
  }

  const handleLegacyLogin = () => {
    // Legacy BLV tenant hardcoded password authentication
    if (password === 'admin123') {
      // For legacy login, store in old format for backward compatibility
      localStorage.setItem('userLevel', 'admin')
      navigate('/')
    } else if (password === 'inventory123') {
      localStorage.setItem('userLevel', 'inventory')
      navigate('/inventory')
    } else {
      setError('Invalid password')
      setPassword('')
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
      <div className="card" style={{ maxWidth: 400, width: '100%', margin: '0 16px' }}>
        <h3 style={{ textAlign: 'center', marginBottom: 24 }}>
          {useEmailLogin ? 'Email Login' : 'BLV App Login'}
        </h3>
        
        <form onSubmit={handleSubmit}>
          {useEmailLogin ? (
            <>
              {/* Email/Password Login */}
              <div style={{ marginBottom: 16 }}>
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError('')
                  }}
                  placeholder="Enter your email"
                  autoFocus
                  style={{ marginTop: 4 }}
                  disabled={loading}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Enter your password"
                  style={{ marginTop: 4 }}
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <>
              {/* Legacy Password-Only Login */}
              <div style={{ marginBottom: 16 }}>
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Enter your password"
                  autoFocus
                  style={{ marginTop: 4 }}
                  disabled={loading}
                />
              </div>
            </>
          )}

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
            disabled={loading || (!useEmailLogin && !password.trim()) || (useEmailLogin && (!email.trim() || !password.trim()))}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Toggle between login methods */}
        <div style={{ 
          marginTop: 20, 
          textAlign: 'center',
          paddingTop: 20,
          borderTop: '1px solid var(--border)'
        }}>
          <button
            type="button"
            onClick={() => {
              setUseEmailLogin(!useEmailLogin)
              setEmail('')
              setPassword('')
              setError('')
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--primary)',
              cursor: 'pointer',
              fontSize: 14,
              textDecoration: 'underline'
            }}
          >
            {useEmailLogin ? 'Use password only (BLV)' : 'Use email login'}
          </button>
        </div>

        {!useEmailLogin && (
          <div style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
            <div style={{ marginBottom: 8 }}>Access Levels:</div>
            <div>• Admin: Full access to all features</div>
            <div>• Inventory: Access to inventory management only</div>
          </div>
        )}
      </div>
    </div>
  )
}