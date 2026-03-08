import React, { useState, useEffect, useCallback, useRef } from 'react'
import { buildLinkGraph, resolveLink, getBacklinks, type VaultFile, type LinkGraph } from '@bazalt/core'
import { useVault } from './features/vault/useVault.js'
import { VaultPicker } from './features/vault/VaultPicker.js'
import { FileTree } from './features/vault/FileTree.js'
import { NoteEditor } from './features/editor/NoteEditor.js'
import { BacklinksPanel } from './features/backlinks/BacklinksPanel.js'
import { SyncPanel } from './features/sync/SyncPanel.js'
import { useSyncSettings } from './features/sync/useSyncSettings.js'
import { useSync } from './features/sync/useSync.js'
import { useAuth } from './features/auth/useAuth.js'
import { LoginPage } from './features/auth/LoginPage.js'
import { AccountPanel } from './features/auth/AccountPanel.js'

type Theme = 'light' | 'dark'
type RightPanel = 'backlinks' | 'sync' | 'account' | null

export function App() {
  const { authState, logout } = useAuth()
  const { state, openVault, readFile, writeFile, createNote, refreshVault } = useVault()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [linkGraph, setLinkGraph] = useState<LinkGraph | null>(null)
  const [theme, setTheme] = useState<Theme>('light')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightPanel, setRightPanel] = useState<RightPanel>('backlinks')
  const loadingRef = useRef(false)

  const { settings, saveSettings, clearSettings } = useSyncSettings()
  // Override token from auth state so user doesn't have to paste it manually
  const effectiveSettings = settings && authState
    ? { ...settings, token: authState.token }
    : settings
  const filePaths = state.status === 'ready' ? [...state.vault.files.keys()] : []
  const { status: syncStatus, lastSynced, error: syncError, sync } = useSync(
    effectiveSettings,
    readFile,
    writeFile,
    filePaths,
  )

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Build link graph when vault loads
  useEffect(() => {
    if (state.status !== 'ready') return
    const files = [...state.vault.files.values()]
    buildLinkGraph(files, readFile)
      .then(setLinkGraph)
      .catch(console.error)
  }, [state, readFile])

  // Load file when selection changes
  useEffect(() => {
    if (!selectedPath || state.status !== 'ready') return
    if (loadingRef.current) return
    loadingRef.current = true
    readFile(selectedPath)
      .then(setFileContent)
      .catch((e) => console.error('readFile error', e))
      .finally(() => { loadingRef.current = false })
  }, [selectedPath, state, readFile])

  const handleSelectFile = useCallback((file: VaultFile) => {
    if (file.type === 'markdown' || file.type === 'excalidraw') {
      setSelectedPath(file.path)
    }
  }, [])

  const handleWikiLinkClick = useCallback(
    async (target: string) => {
      if (state.status !== 'ready') return
      const files = [...state.vault.files.values()]
      const resolved = resolveLink(target, selectedPath ?? '', files)
      if (resolved) {
        setSelectedPath(resolved)
      } else {
        // Create the note if it doesn't exist
        const name = target.endsWith('.md') ? target : `${target}.md`
        await createNote(name, `# ${target}\n`)
        setSelectedPath(name)
      }
    },
    [state, selectedPath, createNote],
  )

  const handleNewNote = useCallback(
    async (name: string) => {
      if (state.status !== 'ready') return
      await createNote(name, `# ${name.replace(/\.md$/, '')}\n`)
      setSelectedPath(name)
    },
    [state, createNote],
  )

  const handleSave = useCallback(
    async (path: string, content: string) => {
      await writeFile(path, content)
      // Rebuild link graph after save
      if (state.status === 'ready') {
        const files = [...state.vault.files.values()]
        buildLinkGraph(files, readFile).then(setLinkGraph).catch(console.error)
      }
    },
    [writeFile, state, readFile],
  )

  const backlinks =
    linkGraph && selectedPath ? getBacklinks(linkGraph, selectedPath) : []

  if (!authState) return <LoginPage />

  // ── Vault picker splash ───────────────────────────────────────────────────
  if (state.status === 'idle') {
    return (
      <VaultPicker
        onOpenVault={openVault}
        onSaveSettings={saveSettings}
        authState={authState}
        logout={logout}
      />
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-950">
        <div className="text-gray-500">Loading vault…</div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-950 gap-4">
        <p className="text-red-500">{state.message}</p>
        <button onClick={openVault} className="px-4 py-2 bg-accent text-white rounded">
          Try Again
        </button>
      </div>
    )
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  const { vault } = state

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0 z-10">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-lg"
          title="Toggle file tree"
        >
          ☰
        </button>
        <span className="font-semibold text-sm truncate flex-1">{vault.name}</span>
        <button
          onClick={refreshVault}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-sm"
          title="Refresh vault"
        >
          ↻
        </button>
        <button
          onClick={() => setRightPanel((p) => (p === 'backlinks' ? null : 'backlinks'))}
          className={`p-1 rounded text-sm ${rightPanel === 'backlinks' ? 'bg-accent/10 text-accent' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          title="Toggle backlinks"
        >
          ⇠
        </button>
        <button
          onClick={() => setRightPanel((p) => (p === 'sync' ? null : 'sync'))}
          className={`p-1 rounded text-sm ${rightPanel === 'sync' ? 'bg-accent/10 text-accent' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          title="Toggle sync panel"
        >
          ☁
        </button>
        <button
          onClick={() => setRightPanel((p) => (p === 'account' ? null : 'account'))}
          className={`p-1 rounded text-sm ${rightPanel === 'account' ? 'bg-accent/10 text-accent' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          title="Account"
        >
          👤
        </button>
        <button
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          title="Toggle theme"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button
          onClick={openVault}
          className="text-xs px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500"
          title="Open different vault"
        >
          Change vault
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* File tree sidebar */}
        {sidebarOpen && (
          <aside className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-hidden flex flex-col">
            <FileTree
              tree={vault.tree}
              selectedPath={selectedPath}
              onSelect={handleSelectFile}
              onNewNote={handleNewNote}
            />
          </aside>
        )}

        {/* Editor area */}
        <main className="flex-1 min-w-0 min-h-0">
          {selectedPath ? (
            <NoteEditor
              path={selectedPath}
              content={fileContent}
              onSave={handleSave}
              onWikiLinkClick={handleWikiLinkClick}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a note to start editing
            </div>
          )}
        </main>

        {/* Right panel */}
        {rightPanel && (
          <aside className="w-56 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-hidden">
            {rightPanel === 'backlinks' && selectedPath && (
              <BacklinksPanel
                currentPath={selectedPath}
                backlinks={backlinks}
                onNavigate={setSelectedPath}
              />
            )}
            {rightPanel === 'sync' && (
              <SyncPanel
                settings={effectiveSettings}
                authToken={authState?.token}
                status={syncStatus}
                lastSynced={lastSynced}
                error={syncError}
                onSaveSettings={saveSettings}
                onClearSettings={clearSettings}
                onSync={sync}
              />
            )}
            {rightPanel === 'account' && <AccountPanel />}
          </aside>
        )}
      </div>
    </div>
  )
}
