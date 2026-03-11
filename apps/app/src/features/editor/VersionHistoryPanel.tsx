import React, { useEffect, useState } from 'react'
import type { FileVersion } from '@bazalt/core'

interface VersionHistoryPanelProps {
  path: string
  listVersions: (path: string) => Promise<FileVersion[]>
  readVersion: (path: string, id: number) => Promise<string>
  restoreVersion: (path: string, id: number) => Promise<void>
  onClose: () => void
  onViewVersion: (content: string) => void
  onRestored: (content: string) => void
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function VersionHistoryPanel({
  path,
  listVersions,
  readVersion,
  restoreVersion,
  onClose,
  onViewVersion,
  onRestored,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<FileVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    listVersions(path)
      .then(setVersions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [path, listVersions])

  const handleView = async (id: number) => {
    setActionId(id)
    try {
      const content = await readVersion(path, id)
      onViewVersion(content)
    } catch (e) {
      setError(String(e))
    } finally {
      setActionId(null)
    }
  }

  const handleRestore = async (id: number) => {
    setActionId(id)
    try {
      const content = await readVersion(path, id)
      await restoreVersion(path, id)
      onRestored(content)
      onClose()
    } catch (e) {
      setError(String(e))
      setActionId(null)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Version History
        </span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs transition-colors"
          title="Close"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            Loading…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 text-xs text-red-500">{error}</div>
        )}
        {!loading && !error && versions.length === 0 && (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            No versions yet
          </div>
        )}
        {versions.map((v, idx) => (
          <div
            key={v.id}
            className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {relativeTime(v.createdAt)}
                {idx === 0 && (
                  <span className="ml-1.5 text-xs text-accent font-normal">(current)</span>
                )}
              </div>
              <div className="text-xs text-gray-400 font-mono mt-0.5">
                {v.hash.slice(0, 8)} · {(v.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => handleView(v.id)}
                disabled={actionId === v.id}
                className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                View
              </button>
              {idx > 0 && (
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={actionId === v.id}
                  className="px-2 py-1 text-xs rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
                >
                  Restore
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
