// src/components/LockOverlay.tsx
import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

export default function LockOverlay() {
  const { t } = useTranslation()
  const { token, pinLock, isLocked, unlock, clearLock, logout, verifyAuth } = useAuth()

  const pinLength = pinLock?.pinLength ?? 6

  // ── Variant A: unlock with existing PIN ──────────────────────────────────
  const [digits, setDigits] = useState<string[]>(Array(pinLength).fill(''))
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Variant B: first-time PIN setup ──────────────────────────────────────
  const [setupPassword, setSetupPassword] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [setupSaving, setSetupSaving] = useState(false)

  const isSetup = isLocked && !pinLock?.userHasPin

  // Focus first digit box when unlock variant appears
  useEffect(() => {
    if (isLocked && !isSetup) {
      setTimeout(() => inputRefs.current[0]?.focus(), 80)
    }
  }, [isLocked, isSetup])

  // Reset state when overlay (re-)appears
  useEffect(() => {
    if (isLocked) {
      setDigits(Array(pinLength).fill(''))
      setUnlockError(null)
      setUnlocking(false)
      setSetupPassword('')
      setSetupPin('')
      setSetupConfirm('')
      setSetupError(null)
      setSetupSaving(false)
    }
  }, [isLocked, pinLength])

  // ── Variant A: submit PIN ─────────────────────────────────────────────────
  const submitPin = useCallback(async (pin: string) => {
    if (unlocking) return
    setUnlocking(true)
    setUnlockError(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/.netlify/functions/session-unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()

      if (res.ok && data.token) { unlock(data.token); return }

      if (res.status === 401 || res.status === 423) {
        logout(); window.location.href = '/login'; return
      }

      const remaining = data.attempts_remaining
      setUnlockError(
        remaining != null
          ? t('pinLock.wrongPinAttempts', { n: remaining })
          : t('pinLock.wrongPin')
      )
      setDigits(Array(pinLength).fill(''))
      setTimeout(() => inputRefs.current[0]?.focus(), 30)
    } catch {
      setUnlockError(t('pinLock.networkError'))
    } finally {
      setUnlocking(false)
    }
  }, [unlocking, token, pinLength, unlock, logout, t])

  const handleDigitInput = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    if (!digit) return
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setUnlockError(null)
    if (index < pinLength - 1) {
      inputRefs.current[index + 1]?.focus()
    } else if (next.every(d => d !== '')) {
      submitPin(next.join(''))
    }
  }

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = [...digits]
      if (next[index]) { next[index] = ''; setDigits(next) }
      else if (index > 0) { next[index - 1] = ''; setDigits(next); inputRefs.current[index - 1]?.focus() }
    } else if (e.key === 'Enter' && digits.every(d => d !== '')) {
      submitPin(digits.join(''))
    }
  }

  // ── Variant B: save new PIN ───────────────────────────────────────────────
  const handleSetupPin = async () => {
    if (setupSaving) return
    if (!setupPassword) { setSetupError(t('settingsPage.pin.passwordRequired')); return }
    if (!/^\d+$/.test(setupPin) || setupPin.length !== pinLength) {
      setSetupError(t('settingsPage.pin.pinFormat', { length: pinLength })); return
    }
    if (setupPin !== setupConfirm) { setSetupError(t('settingsPage.pin.pinMismatch')); return }

    setSetupSaving(true)
    setSetupError(null)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/user-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: setupPassword, new_pin: setupPin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      // Refresh auth context (updates userHasPin) then clear the lock
      await verifyAuth()
      clearLock()
    } catch (err: any) {
      setSetupError(err.message || t('pinLock.networkError'))
      setSetupSaving(false)
    }
  }

  if (!isLocked) return null

  const overlay = (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: 360, padding: '32px 28px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36 }}>🔒</div>

        {isSetup ? (
          // ── Variant B: set up PIN ─────────────────────────────────────────
          <>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 6 }}>{t('pinLock.setupTitle')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('pinLock.setupSubtitle', { length: pinLength })}</div>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
              <div>
                <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('settingsPage.pin.accountPassword')}</label>
                <input
                  type="password"
                  value={setupPassword}
                  onChange={e => { setSetupPassword(e.target.value); setSetupError(null) }}
                  autoComplete="current-password"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('settingsPage.pin.newPin', { length: pinLength })}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={setupPin}
                  onChange={e => { setSetupPin(e.target.value.replace(/\D/g, '').slice(0, pinLength)); setSetupError(null) }}
                  placeholder={'•'.repeat(pinLength)}
                  autoComplete="one-time-code"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('settingsPage.pin.confirmPin')}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={setupConfirm}
                  onChange={e => { setSetupConfirm(e.target.value.replace(/\D/g, '').slice(0, pinLength)); setSetupError(null) }}
                  placeholder={'•'.repeat(pinLength)}
                  autoComplete="one-time-code"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {setupError && (
              <div style={{ color: 'var(--danger, #e53e3e)', fontSize: 13, marginTop: -8, alignSelf: 'flex-start' }}>
                {setupError}
              </div>
            )}

            <button className="primary" onClick={handleSetupPin} disabled={setupSaving} style={{ width: '100%' }}>
              {setupSaving ? t('saving') : t('settingsPage.pin.setButton')}
            </button>
          </>
        ) : (
          // ── Variant A: enter PIN ──────────────────────────────────────────
          <>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 6 }}>{t('pinLock.title')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('pinLock.subtitle', { length: pinLength })}</div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  disabled={unlocking}
                  onChange={e => handleDigitInput(i, e.target.value)}
                  onKeyDown={e => handleDigitKeyDown(i, e)}
                  onFocus={e => e.target.select()}
                  style={{
                    width: 44, height: 52, textAlign: 'center', fontSize: 24,
                    border: `2px solid ${unlockError ? 'var(--danger, #e53e3e)' : 'var(--border)'}`,
                    borderRadius: 8, background: 'var(--input-bg, var(--bg))', color: 'var(--text)',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                />
              ))}
            </div>

            {unlockError && (
              <div style={{ color: 'var(--danger, #e53e3e)', fontSize: 13, marginTop: -8 }}>{unlockError}</div>
            )}
            {unlocking && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('pinLock.verifying')}</div>
            )}
          </>
        )}

        <button
          onClick={() => { logout(); window.location.href = '/login' }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          {t('pinLock.signOut')}
        </button>
      </div>
    </div>
  )

  return overlay
}
