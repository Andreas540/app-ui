import { useState } from 'react'

interface LoginProps {
  onLogin: (userLevel: 'admin' | 'inventory') => void
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password === 'admin123') {
      onLogin('admin')
    } else if (password === 'inventory123') {
      onLogin('inventory')
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
        <h3 style={{ textAlign: 'center', marginBottom: 24 }}>BLV App Login</h3>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('') // Clear error when typing
              }}
              placeholder="Enter your password"
              autoFocus
              style={{ marginTop: 4 }}
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
            disabled={!password.trim()}
          >
            Login
          </button>
        </form>

        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
          <div style={{ marginBottom: 8 }}>Access Levels:</div>
          <div>• Admin: Full access to all features</div>
          <div>• Inventory: Access to inventory management only</div>
        </div>
      </div>
    </div>
  )
}