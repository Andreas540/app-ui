// src/hooks/useIdleTimeout.ts
import { useEffect, useRef } from 'react'

export function useIdleTimeout(timeoutMs: number, onTimeout: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)  // ✅ Add initial value

  const resetTimer = () => {
    // Clear existing timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Start new timer
    timeoutRef.current = setTimeout(() => {
      console.log('⏰ Idle timeout reached - logging out')
      onTimeout()
    }, timeoutMs)
  }

  useEffect(() => {
    // Events that count as "activity"
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']

    // Reset timer on any activity
    const handleActivity = () => {
      console.log('🔄 Activity detected - resetting idle timer')
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