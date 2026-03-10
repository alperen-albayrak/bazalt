import { useRef } from 'react'

type ViewMode = 'edit' | 'split' | 'preview'

const STORAGE_KEY = 'bazalt_note_view_modes'

function load(): Record<string, ViewMode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function save(data: Record<string, ViewMode>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

export function useNoteViewModes() {
  const ref = useRef<Record<string, ViewMode>>(load())

  const get = (path: string, fallback: ViewMode): ViewMode =>
    ref.current[path] ?? fallback

  const set = (path: string, mode: ViewMode): void => {
    ref.current[path] = mode
    save(ref.current)
  }

  return { get, set }
}
