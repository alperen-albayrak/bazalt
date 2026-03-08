import { useState, useCallback } from 'react'

export interface SyncSettings {
  serverUrl: string
  token: string
  vaultId: string
}

// Same default as API_BASE — empty string = relative = same origin
const DEFAULT_SERVER_URL: string = import.meta.env.VITE_API_URL ?? ''

const STORAGE_KEY = 'bazalt_sync_settings'

function loadSettings(): SyncSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SyncSettings
    // Fill serverUrl from env if not saved yet
    if (!parsed.serverUrl) parsed.serverUrl = DEFAULT_SERVER_URL
    return parsed
  } catch {
    return null
  }
}

export function useSyncSettings() {
  const [settings, setSettingsState] = useState<SyncSettings | null>(loadSettings)

  const saveSettings = useCallback((s: SyncSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    setSettingsState(s)
  }, [])

  const clearSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSettingsState(null)
  }, [])

  return { settings, saveSettings, clearSettings }
}
