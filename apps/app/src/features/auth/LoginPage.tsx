import React, { useState } from 'react'
import { useAuth, API_BASE } from './useAuth.js'

type Tab = 'login' | 'register'
type Step = 'form' | 'totp'

const inputCls =
  'w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 outline-none focus:border-accent'
const btnCls =
  'w-full px-4 py-2 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50'

export function LoginPage() {
  const { login, setToken } = useAuth()

  const [tab, setTab] = useState<Tab>('login')
  const [step, setStep] = useState<Step>('form')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.requiresTOTP) {
        setTempToken(result.tempToken!)
        setStep('totp')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || 'Registration failed')
      }
      const data = await res.json()
      setToken(data.token, data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempToken}`,
        },
        body: JSON.stringify({ code: totpCode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).error || 'Invalid code')
      }
      const data = await res.json()
      setToken(data.token, data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-2">🪨</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bazalt</h1>
          <p className="text-sm text-gray-400 mt-1">Open-source Obsidian alternative</p>
        </div>

        {step === 'form' && (
          <>
            <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {(['login', 'register'] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                    tab === t
                      ? 'bg-accent text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => { setTab(t); setError('') }}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <input className={inputCls} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className={inputCls} type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button type="submit" disabled={loading} className={btnCls}>
                  {loading ? 'Logging in…' : 'Login'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <input className={inputCls} type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
                <input className={inputCls} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className={inputCls} type="password" placeholder="Password (min 8 chars)" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button type="submit" disabled={loading} className={btnCls}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            )}
          </>
        )}

        {step === 'totp' && (
          <form onSubmit={handleTotp} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Enter the 6-digit code from your authenticator app, or a backup code.
            </p>
            <input
              className={`${inputCls} text-center text-lg tracking-widest`}
              placeholder="000000"
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              maxLength={20}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('form'); setError(''); setTotpCode('') }}
              className="w-full text-xs text-gray-400 hover:text-gray-600"
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
