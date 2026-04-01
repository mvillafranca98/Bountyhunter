import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bh_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  // Verify token on mount
  useEffect(() => {
    const token = localStorage.getItem('bh_token')
    if (!token) { setLoading(false); return }

    authApi.me()
      .then(({ data }) => setUser(data.user))
      .catch(() => { localStorage.removeItem('bh_token'); localStorage.removeItem('bh_user') })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login({ email, password })
    localStorage.setItem('bh_token', data.token)
    localStorage.setItem('bh_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (form) => {
    const { data } = await authApi.register(form)
    localStorage.setItem('bh_token', data.token)
    localStorage.setItem('bh_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('bh_token')
    localStorage.removeItem('bh_user')
    setUser(null)
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem('bh_user', JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
