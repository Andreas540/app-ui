// src/components/LockOverlay.tsx
import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

export default function LockOverlay() {
  const { t } = useTranslation()
  const { token, pinLock, isLocked, unlock, logout } = useAuth()

  const pinLength = pinLock?.pinLength ?? 6
  const [digits, setDigits] = useState<string[]>(Array(pinLength).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Focus first empty box when overlay appears
  useEffect(() => {
    if (isLocked) {
      setTimeout(() => inputRefs.current[0]?.focus(), 80)
    }
  }, [isLocked])

  // Reset state when overlay (re-)appears
  useEffect(() => {
    if (isLocked) {
      setDigits(Array(pinLength).fill(''))
      setError(null)
      setLoading(false)
    }
  }, [isLocked, pinLength])

  const submit = useCallback(async (pin: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/.netlify/functions/session-unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()

      if (res.ok && data.token) {
        unlock(data.token)
        return
      }

      if (res.status === 401) {
        // Token expired — force full logout
        logout()
        window.location.href = '/login'
        return
      }

      if (res.status === 423) {
        // Server-side lockout
        logout()
        window.location.href = '/login'
        return
      }

      const remaining = data.attempts_remaining
      setError(
        remaining != null
          ? t('pinLock.wrongPinAttempts', { n: remaining })
          : t('pinLock.wrongPin')
      )
      setDigits(Array(pinLength).fill(''))
      setTimeout(() => inputRefs.current[0]?.focus(), 30)
    } catch {
      setError(t('pinLock.networkError'))
    } finally {
      setLoading(false)
    }
  }, [loading, token, pinLength, unlock, logout, t])

  const handleInput = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    if (!digit) return
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)

    if (index < pinLength - 1) {
      inputRefs.current[index + 1]?.focus()
    } else if (next.every(d => d !== '')) {
      submit(next.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = [...digits]
      if (next[index]) {
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        next[index - 1] = ''
        setDigits(next)
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'Enter' && digits.every(d => d !== '')) {
      submit(digits.join(''))
    }
  }

  if (!isLocked) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--backdrop, rgba(0,0,0,0.75))',
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 360,
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36 }}>🔒</div>

        <div>
          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 6 }}>
            {t('pinLock.title')}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            {t('pinLock.subtitle', { length: pinLength })}
          </div>
        </div>

        {/* PIN digit inputs */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              disabled={loading}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onFocus={e => e.target.select()}
              style={{
                width: 44,
                height: 52,
                textAlign: 'center',
                fontSize: 24,
                border: `2px solid ${error ? 'var(--danger, #e53e3e)' : 'var(--border)'}`,
                borderRadius: 8,
                background: 'var(--input-bg, var(--bg))',
                color: 'var(--text)',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div style={{ color: 'var(--danger, #e53e3e)', fontSize: 13, marginTop: -8 }}>
            {error}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            {t('pinLock.verifying')}
          </div>
        )}

        {/* Sign out link */}
        <button
          onClick={() => { logout(); window.location.href = '/login' }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 13,
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: 0,
          }}
        >
          {t('pinLock.signOut')}
        </button>
      </div>
    </div>
  )
}
