import { useState, useCallback } from 'react'

export interface Preferences {
  theme: 'light' | 'dark'
  sidebarOpen: boolean
  defaultViewMode: 'edit' | 'split' | 'preview'
}

const STORAGE_KEY = 'bazalt_preferences'
const DEFAULTS: Preferences = { theme: 'light', sidebarOpen: true, defaultViewMode: 'split' }

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(load)

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { prefs, update }
}
