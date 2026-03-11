import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { SavedAccount } from '@bazalt/core'

const STORAGE_KEY = 'bazalt_accounts'

function loadFromLocalStorage(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function useAccounts() {
  const isElectron = !!window.electronAPI
  const isNative = Capacitor.isNativePlatform()
  const [accounts, setAccounts] = useState<SavedAccount[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const clean = (data: SavedAccount[]) => data.filter((a) => a.serverUrl && a.token)
    if (isElectron) {
      window.electronAPI!.accounts.load().then((data) => {
        setAccounts(clean(data))
        setLoaded(true)
      })
    } else if (isNative) {
      Preferences.get({ key: STORAGE_KEY }).then(({ value }) => {
        try {
          setAccounts(clean(value ? JSON.parse(value) : []))
        } catch {
          setAccounts([])
        }
        setLoaded(true)
      })
    } else {
      setAccounts(clean(loadFromLocalStorage()))
      setLoaded(true)
    }
  }, [isElectron, isNative])

  const persist = useCallback((updated: SavedAccount[]) => {
    setAccounts(updated)
    if (isElectron) {
      window.electronAPI!.accounts.save(updated)
    } else if (isNative) {
      Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(updated) })
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }
  }, [isElectron, isNative])

  const initiateLogin = useCallback(async (
    serverUrl: string,
    email: string,
    password: string,
  ): Promise<{ done: true; account: SavedAccount } | { done: false; tempToken: string; serverUrl: string; email: string }> => {
    const raw = serverUrl.trim().replace(/\/$/, '')
    const base = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? 'Login failed')
    }
    const data = await res.json()
    if (data.requiresTOTP) {
      return { done: false, tempToken: data.tempToken as string, serverUrl: base, email }
    }
    if (!data.token || typeof data.token !== 'string') {
      throw new Error('Server did not return a token — check server logs.')
    }
    const account: SavedAccount = {
      id: crypto.randomUUID(),
      serverUrl: base,
      email,
      token: data.token,
    }
    persist([...accounts, account])
    return { done: true, account }
  }, [accounts, persist])

  const completeTotp = useCallback(async (
    serverUrl: string,
    email: string,
    tempToken: string,
    code: string,
  ): Promise<SavedAccount> => {
    const res = await fetch(`${serverUrl}/auth/2fa/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tempToken}` },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error ?? 'Invalid code')
    }
    const data = await res.json()
    const account: SavedAccount = {
      id: crypto.randomUUID(),
      serverUrl,
      email,
      token: data.token as string,
    }
    persist([...accounts, account])
    return account
  }, [accounts, persist])

  const removeAccount = useCallback((id: string) => {
    persist(accounts.filter((a) => a.id !== id))
  }, [accounts, persist])

  const updateToken = useCallback((id: string, token: string) => {
    persist(accounts.map((a) => (a.id === id ? { ...a, token } : a)))
  }, [accounts, persist])

  return { accounts, loaded, initiateLogin, completeTotp, removeAccount, updateToken }
}
