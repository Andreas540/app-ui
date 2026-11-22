// src/hooks/useIdleLock.ts
//
// Raises the PIN overlay after idleLockMinutes of inactivity.
//
// Like the hard logout in useIdleTimeout, the countdown is anchored to a STORED
// TIMESTAMP rather than to setTimeout alone. Nothing runs while a machine sleeps,
// so the point is not to keep counting — it is to notice on wake how much time
// has passed. Without that, the sequence that defeats the lock entirely is the
// ordinary one: the computer sleeps, you nudge the mouse to wake the screen, that
// nudge resets the clock, and the lock never appears.
//
// Every path that could follow a wake therefore compares wall-clock time first:
// the timer firing, the tab becoming visible, the window regaining focus, and any
// activity event — the activity check running BEFORE the stamp is refreshed.
//
// The stamp lives in localStorage, so tabs of the same session share one clock,
// which matches the lock already being broadcast across tabs.
//
// Its own stamp rather than one shared with useIdleTimeout: the two hooks agree on
// what counts as activity, but they start and stop at different moments — this one
// is disabled while locked, that one keeps counting — so sharing a key would couple
// two clocks that are reset on different conditions.
import { useEffect, useRef } from 'react'

const KEY_PREFIX = 'pinLock_lastActivity'

/** Per-identity, so the next person to log in does not inherit the previous
 *  one's idle clock. */
function storageKey(userKey: string | null | undefined): string {
  return `${KEY_PREFIX}:${userKey || 'anon'}`
}

/** Drop the stored stamp. Call on logout. */
export function clearIdleLockActivity(userKey?: string | null) {
  try {
    if (userKey) localStorage.removeItem(storageKey(userKey))
    localStorage.removeItem(KEY_PREFIX)
    // Older builds kept this in sessionStorage under the bare key.
    sessionStorage.removeItem(KEY_PREFIX)
  } catch { /* storage unavailable; nothing to clear */ }
}

export function useIdleLock({
  enabled,
  idleLockMinutes,
  isLocked,
  userKey,
  onLock,
}: {
  enabled: boolean
  idleLockMinutes: number
  isLocked: boolean
  userKey?: string | null
  onLock: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onLockRef = useRef(onLock)
  useEffect(() => { onLockRef.current = onLock })
  const memoryStampRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled || isLocked) {
      clearTimeout(timerRef.current)
      return
    }

    const key = storageKey(userKey)
    const thresholdMs = idleLockMinutes * 60 * 1000

    const readStamp = (): number => {
      try {
        const n = Number(localStorage.getItem(key))
        return Number.isFinite(n) && n > 0 ? n : memoryStampRef.current
      } catch {
        return memoryStampRef.current
      }
    }

    const writeStamp = (t: number) => {
      memoryStampRef.current = t
      try { localStorage.setItem(key, String(t)) } catch { /* memory only */ }
    }

    /**
     * The only place that decides. Reschedules for whatever is actually left, so
     * a timer that fired late — or a tab waking to find another tab's activity —
     * lands on the right answer instead of locking a session in active use.
     */
    const check = () => {
      const elapsed = Date.now() - readStamp()
      if (elapsed >= thresholdMs) {
        clearTimeout(timerRef.current)
        onLockRef.current()
        return
      }
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(check, thresholdMs - elapsed)
    }

    const handleActivity = () => {
      // Checked BEFORE the stamp is refreshed. This is the whole fix: the mouse
      // nudge that wakes a sleeping screen must lock, not reset.
      if (Date.now() - readStamp() >= thresholdMs) {
        clearTimeout(timerRef.current)
        onLockRef.current()
        return
      }
      writeStamp(Date.now())
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(check, thresholdMs)
    }

    /**
     * Seed the clock only if nothing is stored. Overwriting on mount would mean a
     * browser closed for three hours and reopened starts fresh, which is exactly
     * the time away that should count. A stored stamp is never from another
     * session: it is cleared on login and on logout, and keyed per user.
     */
    const seedStamp = () => {
      let stored = 0
      try { stored = Number(localStorage.getItem(key)) } catch { stored = 0 }
      if (!Number.isFinite(stored) || stored <= 0) writeStamp(Date.now())
      else memoryStampRef.current = stored
    }

    const handleWake = () => {
      if (document.visibilityState === 'hidden') return
      check()
    }

    seedStamp()

    // Same list as useIdleTimeout, deliberately: activity means a deliberate
    // action, not a moved cursor. mousemove used to be here, which meant a bumped
    // desk or a jittery mouse kept the screen unlocked all day — and the person
    // then hit the hard logout without ever seeing the PIN screen.
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const
    events.forEach(e => window.addEventListener(e, handleActivity, true))
    document.addEventListener('visibilitychange', handleWake)
    window.addEventListener('focus', handleWake)
    check()

    return () => {
      clearTimeout(timerRef.current)
      events.forEach(e => window.removeEventListener(e, handleActivity, true))
      document.removeEventListener('visibilitychange', handleWake)
      window.removeEventListener('focus', handleWake)
    }
  }, [enabled, isLocked, idleLockMinutes, userKey])
}
