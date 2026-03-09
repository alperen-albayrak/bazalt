import React, { useState } from 'react'
import type { SyncSettings } from './useSyncSettings.js'
import type { SyncStatus } from './useSync.js'

interface SyncPanelProps {
  settings: SyncSettings | null
  authToken?: string
  status: SyncStatus
  lastSynced: Date | null
  error: string | null
  onSaveSettings: (s: SyncSettings) => void
  onClearSettings: () => void
  onSync: () => void
}

export function SyncPanel({
  settings,
  authToken,
  status,
  lastSynced,
  error,
  onSaveSettings,
  onClearSettings,
  onSync,
}: SyncPanelProps) {
  const [form, setForm] = useState<SyncSettings>(
    settings ?? { serverUrl: '', token: '', vaultId: '' },
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSaveSettings(form)
  }

  const statusIcon = {
    idle: '○',
    syncing: '↻',
    success: '✓',
    error: '✗',
  }[status]

  const statusColor = {
    idle: 'text-gray-400',
    syncing: 'text-blue-500 animate-spin',
    success: 'text-green-500',
    error: 'text-red-500',
  }[status]

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
        Server Sync
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Status */}
        {settings && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs ${statusColor}`}>
                {statusIcon}
              </span>
              <span className="text-gray-500">
                {status === 'syncing' && 'Syncing…'}
                {status === 'success' && lastSynced && `Synced ${formatTime(lastSynced)}`}
                {status === 'error' && 'Sync failed'}
                {status === 'idle' && 'Ready'}
              </span>
            </div>
            <button
              onClick={onSync}
              disabled={status === 'syncing'}
              className="px-2 py-1 text-xs bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50"
            >
              Sync
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-md p-2 break-words">
            {error}
          </p>
        )}

        {/* Settings form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Server URL</label>
            <input
              className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-900 outline-none focus:border-accent"
              placeholder="http://localhost"
              value={form.serverUrl}
              onChange={(e) => setForm((f) => ({ ...f, serverUrl: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Auth Token</label>
            {authToken ? (
              <input
                type="password"
                readOnly
                className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                value={authToken}
              />
            ) : (
              <input
                type="password"
                className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-900 outline-none focus:border-accent"
                placeholder="JWT token from login"
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              />
            )}
            {authToken && (
              <p className="text-xs text-gray-400 mt-1">Token managed by login session.</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vault ID</label>
            <input
              className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-900 outline-none focus:border-accent"
              placeholder="vault ID from server"
              value={form.vaultId}
              onChange={(e) => setForm((f) => ({ ...f, vaultId: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-2 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover"
            >
              Save
            </button>
            {settings && (
              <button
                type="button"
                onClick={onClearSettings}
                className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                Disconnect
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
