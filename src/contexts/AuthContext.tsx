// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react'
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
  features: FeatureId[]
  // Add language/locale fields
  preferred_language?: string
  preferred_locale?: string
  // Add tenant-level language/locale fields
  tenant_default_language?: string
  tenant_default_locale?: string
  tenant_available_languages?: string[]
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  hasFeature: (featureId: FeatureId) => boolean
  login: (token: string, userData: User) => void
  logout: () => void
  verifyAuth: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check for existing auth on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken')
    const storedUser = localStorage.getItem('userData')
    
    if (storedToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setToken(storedToken)
        setUser(userData)
        // Optionally verify token is still valid
        verifyToken(storedToken)
      } catch (err) {
        console.error('Failed to parse stored user data:', err)
        logout()
      }
    }
    setIsLoading(false)
  }, [])

  const verifyToken = async (tokenToVerify: string) => {
    try {
      // Get active tenant if set
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
        // Update stored user data with fresh features
        localStorage.setItem('userData', JSON.stringify(data.user))
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

  const login = (newToken: string, userData: User) => {
  setToken(newToken)
  setUser(userData)
  localStorage.setItem('authToken', newToken)
  localStorage.setItem('userData', JSON.stringify(userData))
  
  // Always handle activeTenantId - set it OR clear it for SuperAdmin
  if (userData.tenantId) {
    localStorage.setItem('activeTenantId', userData.tenantId)
  } else {
    // SuperAdmin or users without tenant - REMOVE any old tenant ID
    localStorage.removeItem('activeTenantId')
  }
}

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('userData')
    localStorage.removeItem('userLevel') // Clear legacy userLevel too
    localStorage.removeItem('activeTenantId')  // 🆕 ADD THIS
  }

  const verifyAuth = async () => {
    if (!token) return false
    return verifyToken(token)
  }

  const hasFeature = (featureId: FeatureId): boolean => {
    if (!user) return false
    // Super admins with tenant selected have access to all features
    if (user.role === 'super_admin' && user.tenantId) return true
    // Super admins without tenant have no feature access (global mode)
    if (user.role === 'super_admin' && !user.tenantId) return false
    // Regular users: check if feature is in user's enabled features
    return user.features?.includes(featureId) || false
  }

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isSuperAdmin: user?.role === 'super_admin',
    hasFeature,
    login,
    logout,
    verifyAuth
  }

  if (isLoading) {
    return <div>Loading...</div> // Or your loading component
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

// Hook to get auth headers for API calls
export function useAuthHeaders() {
  const { token } = useAuth()
  
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}
