// src/hooks/useIdleLock.ts
// Triggers onLock() after idleLockMinutes of inactivity.
// Also checks on tab-visibility restore (user coming back to a hidden tab).
import { useEffect, useRef } from 'react'

const LAST_ACTIVITY_KEY = 'pinLock_lastActivity'

export function useIdleLock({
  enabled,
  idleLockMinutes,
  isLocked,
  onLock,
}: {
  enabled: boolean
  idleLockMinutes: number
  isLocked: boolean
  onLock: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onLockRef = useRef(onLock)
  useEffect(() => { onLockRef.current = onLock })

  useEffect(() => {
    if (!enabled || isLocked) {
      clearTimeout(timerRef.current)
      return
    }

    const thresholdMs = idleLockMinutes * 60 * 1000

    const reset = () => {
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onLockRef.current(), thresholdMs)
    }

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const last = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || Date.now())
      if (Date.now() - last >= thresholdMs) {
        onLockRef.current()
      } else {
        reset()
      }
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'] as const
    events.forEach(e => window.addEventListener(e, reset, true))
    document.addEventListener('visibilitychange', handleVisibility)

    reset()

    return () => {
      clearTimeout(timerRef.current)
      events.forEach(e => window.removeEventListener(e, reset, true))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, isLocked, idleLockMinutes])
}
