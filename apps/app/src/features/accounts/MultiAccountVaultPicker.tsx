import React, { useState, useEffect } from 'react'
import type { SavedAccount } from '@bazalt/core'
import { useAccounts } from './useAccounts.js'

interface VaultInfo {
  id: string
  name: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
}

type VaultLoadState = VaultInfo[] | 'loading' | 'error'

interface Props {
  onOpenServerVault: (serverUrl: string, token: string, vaultId: string, vaultName: string) => Promise<void>
  onOpenLocalVault: () => Promise<void>
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  EDITOR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  VIEWER: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const inputCls =
  'w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 outline-none focus:border-accent'
const btnPrimary =
  'px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0'
const btnSecondary =
  'px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'

function hostname(serverUrl: string) {
  try { return new URL(serverUrl).hostname } catch { return serverUrl }
}

export function MultiAccountVaultPicker({ onOpenServerVault, onOpenLocalVault }: Props) {
  const { accounts, loaded, initiateLogin, completeTotp, removeAccount } = useAccounts()

  // vault lists per account id
  const [vaultMap, setVaultMap] = useState<Record<string, VaultLoadState>>({})
  // which vault is currently opening
  const [openingId, setOpeningId] = useState<string | null>(null)

  // Add-account form
  const [showAdd, setShowAdd] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  // TOTP step
  type TotpPending = { serverUrl: string; email: string; tempToken: string }
  const [totpPending, setTotpPending] = useState<TotpPending | null>(null)
  const [totpCode, setTotpCode] = useState('')

  // Fetch vaults for each account once loaded
  useEffect(() => {
    for (const account of accounts) {
      if (vaultMap[account.id] !== undefined) continue
      setVaultMap((prev) => ({ ...prev, [account.id]: 'loading' }))
      fetchVaults(account).then(
        (vaults) => setVaultMap((prev) => ({ ...prev, [account.id]: vaults })),
        () => setVaultMap((prev) => ({ ...prev, [account.id]: 'error' })),
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts])

  async function fetchVaults(account: SavedAccount): Promise<VaultInfo[]> {
    const res = await fetch(`${account.serverUrl}/api/vaults`, {
      headers: { Authorization: `Bearer ${account.token}` },
    })
    if (!res.ok) throw new Error(`${res.status}`)
    return res.json()
  }

  async function handleOpenVault(account: SavedAccount, vault: VaultInfo) {
    setOpeningId(vault.id)
    try {
      await onOpenServerVault(account.serverUrl, account.token, vault.id, vault.name)
    } finally {
      setOpeningId(null)
    }
  }

  function onAccountAdded(account: SavedAccount) {
    setVaultMap((prev) => ({ ...prev, [account.id]: 'loading' }))
    fetchVaults(account).then(
      (vaults) => setVaultMap((prev) => ({ ...prev, [account.id]: vaults })),
      () => setVaultMap((prev) => ({ ...prev, [account.id]: 'error' })),
    )
    setAddUrl('')
    setAddEmail('')
    setAddPassword('')
    setTotpCode('')
    setTotpPending(null)
    setShowAdd(false)
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')
    try {
      const result = await initiateLogin(addUrl, addEmail, addPassword)
      if (result.done) {
        onAccountAdded(result.account)
      } else {
        setTotpPending({ serverUrl: result.serverUrl, email: result.email, tempToken: result.tempToken })
      }
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddLoading(false)
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!totpPending) return
    setAddLoading(true)
    setAddError('')
    try {
      const account = await completeTotp(totpPending.serverUrl, totpPending.email, totpPending.tempToken, totpCode)
      onAccountAdded(account)
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddLoading(false)
    }
  }

  function handleRemoveAccount(id: string) {
    removeAccount(id)
    setVaultMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-400">Loading accounts…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" className="w-7 h-7" alt="Bazalt" />
          <span className="font-bold text-gray-900 dark:text-white text-sm">Bazalt</span>
        </div>
        {accounts.length > 0 && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add account'}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Add account form */}
        {showAdd && (
          <div className="px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            {!totpPending ? (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add account</h3>
                <form onSubmit={handleAddAccount} className="space-y-2">
                  <input
                    className={inputCls}
                    type="text"
                    placeholder="Server URL (e.g. localhost or https://bazalt.example.com)"
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    required
                  />
                  <input
                    className={inputCls}
                    type="email"
                    placeholder="Email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                  />
                  <input
                    className={inputCls}
                    type="password"
                    placeholder="Password"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    required
                  />
                  {addError && <p className="text-xs text-red-500">{addError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={addLoading} className={btnPrimary}>
                      {addLoading ? 'Signing in…' : 'Sign in'}
                    </button>
                    <button type="button" onClick={() => setShowAdd(false)} className={btnSecondary}>
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Two-factor authentication</h3>
                <p className="text-xs text-gray-400 mb-3">Enter the 6-digit code from your authenticator app.</p>
                <form onSubmit={handleTotpSubmit} className="space-y-2">
                  <input
                    className={inputCls}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="000000"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    required
                  />
                  {addError && <p className="text-xs text-red-500">{addError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={addLoading || totpCode.length < 6} className={btnPrimary}>
                      {addLoading ? 'Verifying…' : 'Verify'}
                    </button>
                    <button type="button" onClick={() => { setTotpPending(null); setAddError('') }} className={btnSecondary}>
                      Back
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* Empty state — two clear choices */}
        {accounts.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center h-full py-24 gap-3 px-6">
            <img src="/icon.svg" className="w-12 h-12 mb-2 opacity-80" alt="" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Open a vault</h2>
            <p className="text-sm text-gray-400 text-center mb-2">Connect to a Bazalt server or open a local folder.</p>
            <button onClick={() => setShowAdd(true)} className={btnPrimary + ' w-full max-w-xs'}>
              Connect to server
            </button>
            <button
              onClick={onOpenLocalVault}
              className={btnSecondary + ' w-full max-w-xs'}
            >
              Open local folder
            </button>
          </div>
        )}

        {/* Account sections */}
        {accounts.map((account) => {
          const vaults = vaultMap[account.id]
          return (
            <section key={account.id} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
              {/* Account header */}
              <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-900">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{account.email}</p>
                  <p className="text-xs text-gray-400">{hostname(account.serverUrl)}</p>
                </div>
                <button
                  onClick={() => handleRemoveAccount(account.id)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-3"
                  title="Remove account"
                >
                  Remove
                </button>
              </div>

              {/* Vault list */}
              <div className="px-3 pb-3">
                {vaults === 'loading' && (
                  <p className="text-xs text-gray-400 px-2 py-2">Loading vaults…</p>
                )}
                {vaults === 'error' && (
                  <p className="text-xs text-red-400 px-2 py-2">
                    Failed to load — token may be expired. Remove and re-add the account.
                  </p>
                )}
                {Array.isArray(vaults) && vaults.length === 0 && (
                  <p className="text-xs text-gray-400 px-2 py-2">No vaults yet.</p>
                )}
                {Array.isArray(vaults) &&
                  vaults.map((vault) => (
                    <div
                      key={vault.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 group cursor-default"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{vault.name}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 hidden group-hover:inline-flex ${ROLE_BADGE[vault.role] ?? ROLE_BADGE['VIEWER']}`}
                        >
                          {vault.role}
                        </span>
                      </div>
                      <button
                        onClick={() => handleOpenVault(account, vault)}
                        disabled={openingId !== null}
                        className="text-xs px-3 py-1 bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {openingId === vault.id ? '…' : 'Open'}
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          )
        })}

        {/* Open local folder — always visible when accounts exist */}
        {accounts.length > 0 && !showAdd && (
          <div className="px-5 py-4">
            <button
              onClick={onOpenLocalVault}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Open local folder (no sync)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
