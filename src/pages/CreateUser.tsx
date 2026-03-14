// src/pages/CreateUser.tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

export default function CreateUser() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'tenant_admin' | 'user'>('user')

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    // Validation
    if (!email.trim()) {
      alert(t('createUser.alertEmailRequired'))
      return
    }
    if (!password) {
      alert(t('createUser.alertPasswordRequired'))
      return
    }
    if (password.length < 8) {
      alert(t('createUser.alertPasswordLength'))
      return
    }

    try {
      setCreating(true)
      setError(null)

      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

      const res = await fetch(`${base}/api/user-create`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
      alert(t('createUser.created'))

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
        <h2 style={{ margin: 0 }}>{t('createUser.title')}</h2>
        <Link to="/" className="helper">{t('back_link')}</Link>
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
          <label>{t('createUser.emailRequired')}</label>
          <input
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  placeholder={t('createUser.emailPlaceholder')}
  disabled={creating}
  autoComplete="off"
/>
        </div>

        <div>
          <label>{t('createUser.passwordRequired')}</label>
          <input
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  placeholder={t('createUser.passwordPlaceholder')}
  disabled={creating}
  autoComplete="new-password"
/>
          <div className="helper" style={{ marginTop: 4 }}>
            {t('createUser.passwordRequirement')}
          </div>
        </div>

        <div>
          <label>{t('createUser.nameOptional')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('createUser.namePlaceholder')}
            disabled={creating}
          />
          <div className="helper" style={{ marginTop: 4 }}>
            {t('createUser.nameHelper')}
          </div>
        </div>

        <div>
          <label>{t('role')}</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'tenant_admin' | 'user')}
            disabled={creating}
          >
            <option value="user">{t('userRole')}</option>
            <option value="tenant_admin">{t('adminRole')}</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={creating}
            style={{ flex: 1 }}
          >
            {creating ? t('createUser.creatingText') : t('createUser.createButton')}
          </button>
          <button
            onClick={() => navigate('/')}
            disabled={creating}
            style={{ flex: 1 }}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
