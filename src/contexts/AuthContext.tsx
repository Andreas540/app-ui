// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, useRef } from 'react'
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
}

export interface PinLockConfig {
  enabled: boolean
  pinLength: number
  idleLockMinutes: number
  userHasPin: boolean
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
      const response = await fetch('/.netlify/functions/auth-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
        },
        body: JSON.stringify({ token: tokenToVerify })
      })

      if (!response.ok) {
        logout()
        return false
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
      console.error('Token verification failed:', err)
      logout()
      return false
    }
  }

  const login = (newToken: string, userData: User, pinLockConfig?: PinLockConfig | null) => {
    setToken(newToken)
    setUser(userData)
    setIsLocked(false)
    sessionStorage.removeItem('pinLockLocked')
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
    localStorage.removeItem('pinLockConfig')
  }

  const lock = () => {
    if (!pinLock?.enabled || !pinLock.userHasPin) return
    sessionStorage.setItem('pinLockLocked', '1')
    setIsLocked(true)
    channelRef.current?.postMessage({ type: 'lock' })
  }

  const unlock = (newToken: string) => {
    setToken(newToken)
    localStorage.setItem('authToken', newToken)
    sessionStorage.removeItem('pinLockLocked')
    setIsLocked(false)
    channelRef.current?.postMessage({ type: 'unlock', token: newToken })
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
    if (user.role === 'super_admin' && user.tenantId) return true
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
