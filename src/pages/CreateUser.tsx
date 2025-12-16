// src/pages/CreateUser.tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function CreateUser() {
  const navigate = useNavigate()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'tenant_admin' | 'user'>('user')
  
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    // Validation
    if (!email.trim()) {
      alert('Email is required')
      return
    }
    if (!password) {
      alert('Password is required')
      return
    }
    if (password.length < 8) {
      alert('Password must be at least 8 characters')
      return
    }

    try {
      setCreating(true)
      setError(null)

      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      
      const res = await fetch(`${base}/api/user-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || email.trim(),
          role
        })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(data.error || `Failed to create user (status ${res.status})`)
      }

      const data = await res.json()
      alert(`User created successfully!\n\nEmail: ${data.user.email}\nRole: ${data.user.role}`)
      
      // Clear form
      setEmail('')
      setPassword('')
      setName('')
      setRole('user')
      
      // Optionally navigate back
      // navigate('/admin')
      
    } catch (e: any) {
      console.error('Create user error:', e)
      setError(e?.message || String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Create New User</h2>
        <Link to="/" className="helper">&larr; Back</Link>
      </div>

      {error && (
        <div style={{ 
          padding: 12, 
          marginBottom: 16, 
          background: '#fee', 
          border: '1px solid #fcc',
          borderRadius: 8,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label>Email *</label>
          <input
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder="user@example.com"
  disabled={creating}
  autoComplete="off"
/>
        </div>

        <div>
          <label>Password *</label>
          <input
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  placeholder="Minimum 8 characters"
  disabled={creating}
  autoComplete="new-password"
/>
          <div className="helper" style={{ marginTop: 4 }}>
            Must be at least 8 characters
          </div>
        </div>

        <div>
          <label>Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            disabled={creating}
          />
          <div className="helper" style={{ marginTop: 4 }}>
            If empty, will use email address
          </div>
        </div>

        <div>
          <label>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'tenant_admin' | 'user')}
            disabled={creating}
          >
            <option value="user">User</option>
            <option value="tenant_admin">Admin</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={creating}
            style={{ flex: 1 }}
          >
            {creating ? 'Creating...' : 'Create User'}
          </button>
          <button
            onClick={() => navigate('/')}
            disabled={creating}
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}