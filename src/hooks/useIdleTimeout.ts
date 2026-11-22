// src/hooks/useIdleTimeout.ts
//
// Hard logout after a period of inactivity.
//
// The countdown is anchored to a STORED TIMESTAMP, not to setTimeout alone. A
// timer on its own is throttled in a background tab and frozen outright while the
// machine sleeps, so a laptop closed overnight used to wake with its countdown
// simply resuming — still logged in the next morning. Every path that could
// notice time has passed (the timer firing, the tab becoming visible, the window
// regaining focus, any activity) compares wall-clock time against that stamp
// instead of trusting the timer.
//
// The stamp lives in localStorage, so several tabs of the same session share one
// idle clock: working in one tab keeps the others alive, and a tab that has been
// sitting in the background does not kill a session that is plainly in use.
import { useEffect, useRef } from 'react'

const KEY_PREFIX = 'idleLogout_lastActivity'

/** Per-identity, so the next person to log in on this browser does not inherit
 *  the previous one's idle clock. */
function storageKey(userKey: string | null | undefined): string {
  return `${KEY_PREFIX}:${userKey || 'anon'}`
}

/** Drop the stored stamp. Call on logout so nothing is left for the next login. */
export function clearIdleActivity(userKey?: string | null) {
  try {
    if (userKey) localStorage.removeItem(storageKey(userKey))
    // Older builds wrote an unscoped key; remove it too rather than leaving it
    // to sit in the browser forever.
    localStorage.removeItem(KEY_PREFIX)
  } catch { /* storage unavailable; nothing to clear */ }
}

export function useIdleTimeout({
  timeoutMs,
  enabled = true,
  /** While the PIN overlay is up, time keeps running but activity no longer
   *  counts: a locked screen being touched is not someone working. Entering the
   *  PIN unlocks, which re-runs this effect and starts the clock again. */
  paused = false,
  userKey,
  onTimeout,
}: {
  timeoutMs: number
  enabled?: boolean
  paused?: boolean
  userKey?: string | null
  onTimeout: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const firedRef = useRef(false)
  // Read through a ref so the listeners registered once below always call the
  // current handler rather than the one captured on first render.
  const onTimeoutRef = useRef(onTimeout)
  useEffect(() => { onTimeoutRef.current = onTimeout })
  // Fallback when localStorage throws (private mode, blocked site data). Loses
  // the cross-tab part, keeps the wall-clock part.
  const memoryStampRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timerRef.current)
      return
    }

    const key = storageKey(userKey)
    firedRef.current = false

    const readStamp = (): number => {
      try {
        const raw = localStorage.getItem(key)
        const n = Number(raw)
        return Number.isFinite(n) && n > 0 ? n : memoryStampRef.current
      } catch {
        return memoryStampRef.current
      }
    }

    const writeStamp = (t: number) => {
      memoryStampRef.current = t
      try { localStorage.setItem(key, String(t)) } catch { /* memory only */ }
    }

    async function logAndLogout() {
      // Guard against two paths firing at once (timer and a visibility check
      // landing together), which would log the event twice.
      if (firedRef.current) return
      firedRef.current = true
      clearTimeout(timerRef.current)

      try {
        const token = localStorage.getItem('authToken')
        const activeTenantId = localStorage.getItem('activeTenantId')
        if (token) {
          const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
          await fetch(`${base}/api/log-activity`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
            },
            body: JSON.stringify({ action: 'logout_idle_timeout', error: null }),
          })
        }
      } catch {
        // Logging must never stop the logout itself.
      }

      onTimeoutRef.current()
    }

    /**
     * The only place that decides. Reschedules for whatever is actually left
     * rather than for the full period, so a timer that fired late — or one tab
     * waking to find another tab's activity — lands on the right answer.
     */
    const check = () => {
      if (firedRef.current) return
      const elapsed = Date.now() - readStamp()
      if (elapsed >= timeoutMs) {
        void logAndLogout()
        return
      }
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(check, timeoutMs - elapsed)
    }

    const handleActivity = () => {
      if (paused) return
      // Checked BEFORE the stamp is refreshed: a click that arrives the moment a
      // slept machine wakes must log out, not reset the clock.
      const elapsed = Date.now() - readStamp()
      if (elapsed >= timeoutMs) {
        void logAndLogout()
        return
      }
      writeStamp(Date.now())
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(check, timeoutMs)
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

    // Activity does not count while the screen is locked, but the clock does run.
    if (!paused) {
      seedStamp()
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
    }

    document.addEventListener('visibilitychange', handleWake)
    window.addEventListener('focus', handleWake)
    check()
    return () => {
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', handleWake)
      window.removeEventListener('focus', handleWake)
    }
  }, [enabled, paused, timeoutMs, userKey])
}
