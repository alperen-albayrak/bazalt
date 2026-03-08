import React, { createContext, useContext, useState, useCallback } from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface AuthState {
  token: string
  user: AuthUser
}

// Base URL for all API calls. Empty string = relative = same origin (Docker default).
// Set VITE_API_URL at build time for dev against a remote server.
export const API_BASE: string = import.meta.env.VITE_API_URL ?? ''

interface AuthContextValue {
  authState: AuthState | null
  login: (email: string, password: string) => Promise<{ requiresTOTP: boolean; tempToken?: string }>
  logout: () => void
  setToken: (token: string, user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'bazalt_auth'

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState | null>(loadAuth)

  const setToken = useCallback((token: string, user: AuthUser) => {
    const state: AuthState = { token, user }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    setAuthState(state)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuthState(null)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || 'Login failed')
      }
      const data = await res.json()
      if (data.requiresTOTP) {
        return { requiresTOTP: true as const, tempToken: data.tempToken as string }
      }
      setToken(data.token, data.user)
      return { requiresTOTP: false as const }
    },
    [setToken],
  )

  return React.createElement(
    AuthContext.Provider,
    { value: { authState, login, logout, setToken } },
    children,
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
