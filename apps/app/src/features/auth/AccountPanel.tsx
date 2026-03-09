import React, { useEffect, useState } from 'react'
import { useAuth, API_BASE } from './useAuth.js'

type Section = 'main' | 'setup-qr' | 'setup-verify' | 'show-backup' | 'disable' | 'regen'

const inputCls =
  'w-full text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1.5 bg-white dark:bg-gray-900 outline-none focus:border-accent'
const btnCls =
  'w-full px-2 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50'
const dangerCls =
  'w-full px-2 py-1.5 text-xs border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50'

export function AccountPanel() {
  const { authState, logout, setToken } = useAuth()

  const [section, setSection] = useState<Section>('main')
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [qrData, setQrData] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const authHeader: Record<string, string> = authState
    ? { Authorization: `Bearer ${authState.token}` }
    : {}

  useEffect(() => {
    if (!authState) return
    fetch(`${API_BASE}/auth/me`, { headers: authHeader })
      .then((r) => r.json())
      .then((data: any) => setTotpEnabled(data.totpEnabled ?? false))
      .catch(() => {})
  }, [authState])

  if (!authState) return null

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setError('')
    setLoading(true)
    try {
      return await fn()
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  async function api(path: string, opts: RequestInit = {}) {
    const headers: Record<string, string> = { ...authHeader }
    if (opts.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as any).error || `Request failed (${res.status})`)
    }
    return res.json()
  }

  async function handleSetup() {
    const data = await run(() => api('/auth/2fa/setup', { method: 'POST' }))
    if (!data) return
    setQrData(data)
    setCode('')
    setSection('setup-qr')
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault()
    const data = await run(() => api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }))
    if (!data) return
    setBackupCodes(data.backupCodes)
    setTotpEnabled(true)
    setCode('')
    setSection('show-backup')
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault()
    const data = await run(() =>
      api('/auth/2fa', { method: 'DELETE', body: JSON.stringify({ password }) }),
    )
    if (!data) return
    setTotpEnabled(false)
    setPassword('')
    setSection('main')
  }

  async function handleRegen(e: React.FormEvent) {
    e.preventDefault()
    const data = await run(() =>
      api('/auth/2fa/backup-codes', { method: 'POST', body: JSON.stringify({ code }) }),
    )
    if (!data) return
    setBackupCodes(data.backupCodes)
    setCode('')
    setSection('show-backup')
  }

  const initials = (authState.user.name || authState.user.email).slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
        Account
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {section === 'main' && (
          <>
            {/* User info */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{authState.user.name || authState.user.email}</p>
                {authState.user.name && (
                  <p className="text-xs text-gray-400 truncate">{authState.user.email}</p>
                )}
              </div>
            </div>

            {/* 2FA section */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Two-factor auth</p>
              {totpEnabled ? (
                <>
                  <p className="text-xs text-green-600 dark:text-green-400">✓ Enabled</p>
                  <button
                    onClick={() => { setSection('regen'); setCode(''); setError('') }}
                    className="text-xs text-gray-400 hover:text-accent underline"
                  >
                    Regenerate backup codes
                  </button>
                  <button
                    onClick={() => { setSection('disable'); setPassword(''); setError('') }}
                    className={dangerCls}
                  >
                    Disable 2FA
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400">Not enabled</p>
                  <button onClick={handleSetup} disabled={loading} className={btnCls}>
                    {loading ? 'Loading…' : 'Enable 2FA'}
                  </button>
                </>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <button
              onClick={logout}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              Logout
            </button>
          </>
        )}

        {section === 'setup-qr' && qrData && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Scan this QR code with Google Authenticator or a compatible app.
            </p>
            <img src={qrData.qrDataUrl} alt="QR code" className="w-full rounded border border-gray-200 dark:border-gray-700" />
            <p className="text-xs text-gray-400 break-all">Manual code: <span className="font-mono select-all">{qrData.secret}</span></p>
            <button onClick={() => setSection('setup-verify')} className={btnCls}>
              Next
            </button>
            <button onClick={() => setSection('main')} className="w-full text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        )}

        {section === 'setup-verify' && (
          <form onSubmit={handleEnable} className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Enter the 6-digit code from your authenticator app to confirm setup.
            </p>
            <input
              className={`${inputCls} text-center tracking-widest`}
              placeholder="000000"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? 'Enabling…' : 'Enable 2FA'}
            </button>
            <button type="button" onClick={() => setSection('main')} className="w-full text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </form>
        )}

        {section === 'show-backup' && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
              2FA enabled! Save these backup codes — they won't be shown again.
            </p>
            <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 rounded-md p-2 space-y-0.5">
              {backupCodes.map((c, i) => (
                <p key={i} className="font-mono text-xs select-all text-gray-700 dark:text-gray-300">
                  {c}
                </p>
              ))}
            </div>
            <button onClick={() => setSection('main')} className={btnCls}>
              Done
            </button>
          </div>
        )}

        {section === 'disable' && (
          <form onSubmit={handleDisable} className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Enter your password to disable 2FA.
            </p>
            <input
              className={inputCls}
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className={dangerCls}>
              {loading ? 'Disabling…' : 'Disable 2FA'}
            </button>
            <button type="button" onClick={() => setSection('main')} className="w-full text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </form>
        )}

        {section === 'regen' && (
          <form onSubmit={handleRegen} className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Enter your current TOTP code to regenerate backup codes.
            </p>
            <input
              className={`${inputCls} text-center tracking-widest`}
              placeholder="000000"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? 'Regenerating…' : 'Regenerate'}
            </button>
            <button type="button" onClick={() => setSection('main')} className="w-full text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
