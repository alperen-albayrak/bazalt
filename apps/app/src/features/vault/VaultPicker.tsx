import React, { useEffect, useState } from 'react'
import { AccountPanel } from '../auth/AccountPanel.js'
import { API_BASE, type AuthState } from '../auth/useAuth.js'
import type { SyncSettings } from '../sync/useSyncSettings.js'

interface Vault {
  id: string
  name: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
}

interface VaultPickerProps {
  onOpenVault: () => Promise<void>
  onOpenServerVault: (serverUrl: string, token: string, vaultId: string, vaultName: string) => Promise<void>
  onSaveSettings: (s: SyncSettings) => void
  authState: AuthState
  logout: () => void
}

const inputCls =
  'flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 outline-none focus:border-accent min-w-0'
const btnPrimary =
  'px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm shrink-0'

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  EDITOR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  VIEWER: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

export function VaultPicker({ onOpenVault, onOpenServerVault, onSaveSettings, authState, logout }: VaultPickerProps) {
  const [vaults, setVaults] = useState<Vault[]>([])
  const [loadingVaults, setLoadingVaults] = useState(true)
  const [vaultsError, setVaultsError] = useState('')

  const [newVaultName, setNewVaultName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [openingVaultId, setOpeningVaultId] = useState<string | null>(null)

  const [showAccount, setShowAccount] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [uploadError, setUploadError] = useState('')

  const authHeader = { Authorization: `Bearer ${authState.token}` }

  const TEXT_EXTENSIONS = new Set([
    '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.css', '.js', '.ts', '.html', '.xml', '.csv',
  ])
  function isTextFile(name: string): boolean {
    const dot = name.lastIndexOf('.')
    if (dot < 0) return false
    return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase())
  }

  async function collectTextFiles(
    handle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<{ path: string; content: string }[]> {
    const result: { path: string; content: string }[] = []
    for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (name.startsWith('.')) continue
      const path = prefix ? `${prefix}/${name}` : name
      if (entry.kind === 'file' && isTextFile(name)) {
        const file = await (entry as FileSystemFileHandle).getFile()
        const content = await file.text()
        result.push({ path, content })
      } else if (entry.kind === 'directory') {
        const sub = await handle.getDirectoryHandle(name)
        result.push(...(await collectTextFiles(sub, path)))
      }
    }
    return result
  }

  async function handleUploadFolder() {
    if (!('showDirectoryPicker' in window)) {
      setUploadError('File System Access API not supported in this browser.')
      return
    }
    setUploadError('')
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' })
      const folderName = dirHandle.name

      setUploadProgress({ current: 0, total: 0 })
      const allFiles = await collectTextFiles(dirHandle, '')
      setUploadProgress({ current: 0, total: allFiles.length })

      // Create vault on server
      const res = await fetch(`${API_BASE}/api/vaults`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || `Failed to create vault (${res.status})`)
      }
      const vault: Vault = await res.json()
      onSaveSettings({ serverUrl: API_BASE, token: authState.token, vaultId: vault.id })

      // Push files in batches of 50
      const BATCH = 50
      let pushed = 0
      for (let i = 0; i < allFiles.length; i += BATCH) {
        const batch = allFiles.slice(i, i + BATCH)
        const pushRes = await fetch(`${API_BASE}/api/vaults/${vault.id}/sync/push`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: batch }),
        })
        if (!pushRes.ok) {
          const data = await pushRes.json().catch(() => ({}))
          throw new Error((data as any).error || `Push failed (${pushRes.status})`)
        }
        pushed += batch.length
        setUploadProgress({ current: pushed, total: allFiles.length })
      }

      setUploadProgress(null)
      setVaults((prev) => [...prev, vault])
      await onOpenVault()
    } catch (e: any) {
      if (e.name !== 'AbortError') setUploadError(e.message)
      setUploadProgress(null)
    }
  }

  useEffect(() => {
    setLoadingVaults(true)
    fetch(`${API_BASE}/api/vaults`, { headers: authHeader })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load vaults (${r.status})`)
        return r.json()
      })
      .then((data: Vault[]) => setVaults(data))
      .catch((e) => setVaultsError(e.message))
      .finally(() => setLoadingVaults(false))
  }, [authState.token])

  async function handleOpenVault(vault: Vault) {
    setOpeningVaultId(vault.id)
    try {
      onSaveSettings({ serverUrl: API_BASE, token: authState.token, vaultId: vault.id })
      await onOpenServerVault(API_BASE, authState.token, vault.id, vault.name)
    } finally {
      setOpeningVaultId(null)
    }
  }

  async function handleCreateVault(e: React.FormEvent) {
    e.preventDefault()
    if (!newVaultName.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch(`${API_BASE}/api/vaults`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newVaultName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || `Failed to create vault (${res.status})`)
      }
      const vault: Vault = await res.json()
      onSaveSettings({
        serverUrl: API_BASE,
        token: authState.token,
        vaultId: vault.id,
      })
      await onOpenVault()
    } catch (e: any) {
      setCreateError(e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">🪨</span>
          <span className="font-bold text-gray-900 dark:text-white">Bazalt</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="hidden sm:inline">{authState.user.email}</span>
          <button
            onClick={() => setShowAccount((v) => !v)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300 text-xs font-medium"
          >
            👤 Account Settings
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300 text-xs font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-8">

          {/* Your vaults */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your vaults</h2>
            {loadingVaults && (
              <p className="text-sm text-gray-400">Loading…</p>
            )}
            {!loadingVaults && vaultsError && (
              <p className="text-sm text-red-500">{vaultsError}</p>
            )}
            {!loadingVaults && !vaultsError && vaults.length === 0 && (
              <p className="text-sm text-gray-400">No vaults yet — create one below.</p>
            )}
            {!loadingVaults && vaults.length > 0 && (
              <ul className="space-y-2">
                {vaults.map((vault) => (
                  <li
                    key={vault.id}
                    className="flex items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-700 shadow-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-gray-900 dark:text-white truncate">{vault.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${ROLE_BADGE[vault.role] ?? ROLE_BADGE['VIEWER']}`}>
                        {vault.role}
                      </span>
                    </div>
                    <button
                      onClick={() => handleOpenVault(vault)}
                      disabled={openingVaultId !== null}
                      className={btnPrimary}
                    >
                      {openingVaultId === vault.id ? 'Opening…' : 'Open'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Create new vault */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create new vault</h2>
            <form onSubmit={handleCreateVault} className="flex gap-2">
              <input
                className={inputCls}
                type="text"
                placeholder="Vault name"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                disabled={creating}
              />
              <button type="submit" disabled={creating || !newVaultName.trim()} className={btnPrimary}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </form>
            {createError && <p className="mt-2 text-xs text-red-500">{createError}</p>}
          </section>

          {/* Upload existing folder */}
          <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload existing folder</h2>
            <button
              onClick={handleUploadFolder}
              disabled={uploadProgress !== null || creating || openingVaultId !== null}
              className={btnPrimary}
            >
              {uploadProgress
                ? `Uploading ${uploadProgress.current} / ${uploadProgress.total} files…`
                : 'Upload folder as new vault'}
            </button>
            <p className="mt-1 text-xs text-gray-400">Uploads all markdown and text files to the server.</p>
            {uploadError && <p className="mt-2 text-xs text-red-500">{uploadError}</p>}
            {uploadProgress && (
              <div className="mt-2 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: uploadProgress.total > 0
                      ? `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            )}
          </section>

          {/* Open local folder */}
          <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Local only</h2>
            <button
              onClick={onOpenVault}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              Open local folder (no sync)
            </button>
            <p className="mt-1 text-xs text-gray-400">Opens a local folder without connecting to the server.</p>
          </section>

        </div>
      </div>

      {/* Account Settings overlay */}
      {showAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowAccount(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-80 max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Account Settings</span>
              <button
                onClick={() => setShowAccount(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <AccountPanel />
          </div>
        </div>
      )}
    </div>
  )
}
