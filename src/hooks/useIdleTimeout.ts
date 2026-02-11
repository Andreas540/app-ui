// src/hooks/useIdleTimeout.ts
import { useEffect, useRef } from 'react'

export function useIdleTimeout(timeoutMs: number, onTimeout: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const resetTimer = () => {
    // Clear existing timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Start new timer
    timeoutRef.current = setTimeout(async () => {
      console.log('⏰ Idle timeout reached - logging activity before logout')
      
      // Log the idle timeout before logging out
      try {
        const token = localStorage.getItem('authToken')
        const activeTenantId = localStorage.getItem('activeTenantId')
        
        if (token) {
          const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
          await fetch(`${base}/.netlify/functions/log-activity`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
            },
            body: JSON.stringify({
              action: 'logout_idle_timeout',
              error: null
            })
          })
          
          console.log('✅ Idle timeout logged')
        }
      } catch (err) {
        console.error('Failed to log idle timeout:', err)
        // Continue with logout even if logging fails
      }
      
      // Now perform the actual logout
      onTimeout()
    }, timeoutMs)
  }

  useEffect(() => {
    // Events that count as "activity"
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']

    // Reset timer on any activity
    const handleActivity = () => {
      resetTimer()
    }

    events.forEach(event => {
      window.addEventListener(event, handleActivity, true)
    })

    // Start the initial timer
    resetTimer()

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity, true)
      })
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [timeoutMs])
}