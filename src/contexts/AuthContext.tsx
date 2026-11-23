// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { clearIdleActivity } from '../hooks/useIdleTimeout'
import { clearIdleLockActivity } from '../hooks/useIdleLock'
import type { ReactNode } from 'react'
import type { FeatureId } from '../lib/features'

interface User {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'tenant_admin' | 'tenant_user'
  accessLevel: 'admin' | 'inventory'
  tenantId: string | null
  tenantName: string | null
  businessType: string
  businessTypeConfig: Record<string, unknown>
  features: FeatureId[]
  preferred_language?: string
  preferred_locale?: string
  preferred_currency?: string | null
  preferred_timezone?: string | null
  tenant_default_language?: string
  tenant_default_locale?: string
  tenant_available_languages?: string[]
  tenant_default_currency?: string | null
  tenant_default_timezone?: string | null
  impersonatingUser?: { id: string; name: string; email: string; role: string } | null
}

export interface PinLockConfig {
  /** The tenant's configured policy. Tenant Admin shows and edits this. */
  enabled: boolean
  pinLength: number
  idleLockMinutes: number
  /**
   * Minutes of inactivity before the session is ended outright — a different
   * thing from idleLockMinutes above, which only raises the PIN overlay. Carried
   * in this object because it is the config channel that already reaches the
   * client, not because it is a PIN setting.
   * Optional: configs cached before the field existed will not have it, and the
   * caller falls back to the 90-minute default.
   */
  idleLogoutMinutes?: number
  userHasPin: boolean
  /**
   * Whether this session is actually subject to the policy above. The server decides,
   * because only it knows (from SUPER_ADMIN_EMAILS) that a session is a SuperAdmin
   * support session. Do not infer this from user.role: public.users.role can itself
   * hold the string 'super_admin' for an ordinary tenant user, so a client-side role
   * check would silently disable the lock for them.
   * Absent on configs cached before this field existed — treat only an explicit false
   * as "not enforced", so the fail-safe direction is to lock.
   */
  enforced?: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  pinLock: PinLockConfig | null
  isLocked: boolean
  hasFeature: (featureId: FeatureId) => boolean
  login: (token: string, userData: User, pinLockConfig?: PinLockConfig | null) => void
  logout: () => void
  lock: () => void
  unlock: (newToken: string) => void
  clearLock: () => void
  verifyAuth: () => Promise<boolean>
  refreshConfig: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LOCK_CHANNEL = 'pinLockChannel'

function readStoredPinLock(): PinLockConfig | null {
  try {
    const s = localStorage.getItem('pinLockConfig')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('userData')
      return stored ? (JSON.parse(stored) as User) : null
    } catch { return null }
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'))
  const [pinLock, setPinLock] = useState<PinLockConfig | null>(readStoredPinLock)
  const [isLocked, setIsLocked] = useState<boolean>(
    () => sessionStorage.getItem('pinLockLocked') === '1'
  )

  const channelRef = useRef<BroadcastChannel | null>(null)

  // BroadcastChannel: sync lock/unlock state across tabs
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const ch = new BroadcastChannel(LOCK_CHANNEL)
    channelRef.current = ch
    ch.onmessage = (ev) => {
      if (ev.data?.type === 'lock') {
        sessionStorage.setItem('pinLockLocked', '1')
        setIsLocked(true)
      } else if (ev.data?.type === 'unlock') {
        sessionStorage.removeItem('pinLockLocked')
        setIsLocked(false)
        if (ev.data.token) {
          setToken(ev.data.token)
          localStorage.setItem('authToken', ev.data.token)
        }
      }
    }
    return () => ch.close()
  }, [])

  // Verify token in the background on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken')
    if (storedToken) {
      verifyToken(storedToken).catch(() => {})
    }
  }, [])

  const verifyToken = async (tokenToVerify: string) => {
    try {
      const activeTenantId = localStorage.getItem('activeTenantId')
      const activeUserId = localStorage.getItem('activeUserId')
      const response = await fetch('/.netlify/functions/auth-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
          ...(activeUserId ? { 'X-Active-User': activeUserId } : {}),
        },
        body: JSON.stringify({ token: tokenToVerify })
      })

      // Only a verdict from the server ends the session. A 500, 502 or 503 means
      // the server could not answer, which is not the same as saying no.
      if (response.status === 401 || response.status === 403) {
        logout()
        return false
      }
      if (!response.ok) {
        console.error('Token verification unavailable:', response.status)
        return true
      }

      const data = await response.json()
      if (data.valid && data.user) {
        setUser(data.user)
        localStorage.setItem('userData', JSON.stringify(data.user))
        // Sliding JWT refresh: store the new token returned by auth-verify
        if (data.token) {
          setToken(data.token)
          localStorage.setItem('authToken', data.token)
        }
        if (data.pinLock) {
          setPinLock(data.pinLock)
          localStorage.setItem('pinLockConfig', JSON.stringify(data.pinLock))
        }
        return true
      }

      logout()
      return false
    } catch (err) {
      // A fetch that THREW is a transport failure — wifi moved, the machine just
      // woke, DNS blinked — not a rejected session. Logging out here wiped the
      // token and pinLockConfig and dropped the person on the login screen for a
      // dropped connection, with no message and no PIN prompt. The session is
      // left alone; the next verify five minutes later decides, and a genuinely
      // dead token is still caught by the 401 handling on any real API call.
      console.error('Token verification unreachable:', err)
      return true
    }
  }

  const login = (newToken: string, userData: User, pinLockConfig?: PinLockConfig | null) => {
    setToken(newToken)
    setUser(userData)
    setIsLocked(false)
    sessionStorage.removeItem('pinLockLocked')
    // Start both idle clocks from scratch. The stamps are kept across an app
    // restart on purpose, so without this a fresh login could inherit a stale one
    // and be locked or logged straight back out.
    clearIdleActivity(userData.id)
    clearIdleLockActivity(userData.id)
    localStorage.setItem('authToken', newToken)
    localStorage.setItem('userData', JSON.stringify(userData))

    if (pinLockConfig != null) {
      setPinLock(pinLockConfig)
      localStorage.setItem('pinLockConfig', JSON.stringify(pinLockConfig))
    } else {
      setPinLock(null)
      localStorage.removeItem('pinLockConfig')
    }

    if (userData.tenantId) {
      localStorage.setItem('activeTenantId', userData.tenantId)
    } else {
      localStorage.removeItem('activeTenantId')
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    setPinLock(null)
    setIsLocked(false)
    sessionStorage.removeItem('pinLockLocked')
    localStorage.removeItem('authToken')
    localStorage.removeItem('userData')
    localStorage.removeItem('userLevel')
    localStorage.removeItem('activeTenantId')
    localStorage.removeItem('activeUserId')
    localStorage.removeItem('pinLockConfig')
  }

  const lock = () => {
    if (!pinLock?.enabled) return
    sessionStorage.setItem('pinLockLocked', '1')
    setIsLocked(true)
    channelRef.current?.postMessage({ type: 'lock' })
  }

  /**
   * Entering the right PIN is the clearest possible proof that someone is at the
   * machine, so both idle clocks start again from here. Without this the stamps
   * survive the lock — they are deliberately not overwritten on mount — and the
   * person gets logged out part way through the work they just unlocked to do.
   */
  const resetIdleClocks = () => {
    const id = user?.id ?? null
    clearIdleActivity(id)
    clearIdleLockActivity(id)
  }

  const unlock = (newToken: string) => {
    setToken(newToken)
    localStorage.setItem('authToken', newToken)
    sessionStorage.removeItem('pinLockLocked')
    resetIdleClocks()
    setIsLocked(false)
    channelRef.current?.postMessage({ type: 'unlock', token: newToken })
  }

  const clearLock = () => {
    sessionStorage.removeItem('pinLockLocked')
    resetIdleClocks()
    setIsLocked(false)
    channelRef.current?.postMessage({ type: 'unlock', token: localStorage.getItem('authToken') })
  }

  const verifyAuth = async () => {
    if (!token) return false
    return verifyToken(token)
  }

  const refreshConfig = () => {
    try {
      const stored = localStorage.getItem('userData')
      if (stored) setUser(JSON.parse(stored) as User)
    } catch { /* ignore */ }
  }

  const hasFeature = (featureId: FeatureId): boolean => {
    if (!user) return false
    if (user.role === 'super_admin' && !user.tenantId) return false
    return user.features?.includes(featureId) || false
  }

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isSuperAdmin: user?.role === 'super_admin',
    pinLock,
    isLocked,
    hasFeature,
    login,
    logout,
    lock,
    unlock,
    clearLock,
    verifyAuth,
    refreshConfig,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useAuthHeaders() {
  const { token } = useAuth()
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}
