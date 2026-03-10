import React from 'react'
import { AccountPanel } from '../auth/AccountPanel.js'
import { SyncPanel } from '../sync/SyncPanel.js'
import type { SyncSettings } from '../sync/useSyncSettings.js'
import type { SyncStatus } from '../sync/useSync.js'
import type { AuthState } from '../auth/useAuth.js'

type Theme = 'light' | 'dark'
type ViewMode = 'edit' | 'split' | 'preview'

interface SettingsPanelProps {
  theme: Theme
  onThemeChange: (t: Theme) => void
  defaultViewMode: ViewMode
  onDefaultViewModeChange: (m: ViewMode) => void
  vaultName: string
  onChangeVault: () => void
  syncSettings: SyncSettings | null
  authToken: string | undefined
  syncStatus: SyncStatus
  syncLastSynced: Date | null
  syncError: string | null
  onSaveSettings: (s: SyncSettings) => void
  onClearSettings: () => void
  onSync: () => void
  authState: AuthState | null
  isElectron: boolean
  isNative: boolean
  onClose: () => void
}

const sectionLabel = 'text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3'

export function SettingsPanel({
  theme,
  onThemeChange,
  defaultViewMode,
  onDefaultViewModeChange,
  vaultName,
  onChangeVault,
  syncSettings,
  authToken,
  syncStatus,
  syncLastSynced,
  syncError,
  onSaveSettings,
  onClearSettings,
  onSync,
  authState,
  isElectron,
  isNative,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
          Settings
        </span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs"
          title="Close settings"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Appearance */}
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className={sectionLabel}>Appearance</p>
          <div className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">Theme</span>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs bg-gray-50 dark:bg-gray-800">
              <button
                onClick={() => onThemeChange('light')}
                className={[
                  'px-3 py-1.5',
                  theme === 'light'
                    ? 'bg-accent text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                ☀️ Light
              </button>
              <button
                onClick={() => onThemeChange('dark')}
                className={[
                  'px-3 py-1.5',
                  theme === 'dark'
                    ? 'bg-accent text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                🌙 Dark
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-gray-700 dark:text-gray-300">Default view</span>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs bg-gray-50 dark:bg-gray-800">
              {(['edit', 'split', 'preview'] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onDefaultViewModeChange(m)}
                  className={[
                    'px-2.5 py-1.5 capitalize',
                    defaultViewMode === m
                      ? 'bg-accent text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vault */}
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className={sectionLabel}>Vault</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-700 dark:text-gray-300 truncate text-sm">{vaultName}</span>
            <button
              onClick={onChangeVault}
              className="shrink-0 px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            >
              Change
            </button>
          </div>
        </div>

        {/* Sync */}
        <div className="border-b border-gray-100 dark:border-gray-800">
          <div className="px-4 pt-4 pb-1">
            <p className={sectionLabel}>Sync</p>
          </div>
          <SyncPanel
            settings={syncSettings}
            authToken={authToken}
            status={syncStatus}
            lastSynced={syncLastSynced}
            error={syncError}
            onSaveSettings={onSaveSettings}
            onClearSettings={onClearSettings}
            onSync={onSync}
          />
        </div>

        {/* Account — web only */}
        {authState && !isElectron && !isNative && (
          <div>
            <div className="px-4 pt-4 pb-1">
              <p className={sectionLabel}>Account</p>
            </div>
            <AccountPanel />
          </div>
        )}
      </div>
    </div>
  )
}
