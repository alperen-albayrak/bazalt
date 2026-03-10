import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { buildLinkGraph, resolveLink, getBacklinks, type VaultFile, type LinkGraph } from '@bazalt/core'
import { useVault } from './features/vault/useVault.js'
import { VaultPicker } from './features/vault/VaultPicker.js'
import { MultiAccountVaultPicker } from './features/accounts/MultiAccountVaultPicker.js'
import { FileTree } from './features/vault/FileTree.js'
import { PaneContainer } from './features/editor/PaneContainer.js'
import { PaneSplitter } from './features/editor/PaneSplitter.js'
import { BacklinksPanel } from './features/backlinks/BacklinksPanel.js'
import { useSyncSettings } from './features/sync/useSyncSettings.js'
import { useSync } from './features/sync/useSync.js'
import { useAuth } from './features/auth/useAuth.js'
import { LoginPage } from './features/auth/LoginPage.js'
import { GraphView } from './features/graph/GraphView.js'
import { SettingsPanel } from './features/settings/SettingsPanel.js'
import { usePreferences } from './features/settings/usePreferences.js'
import { useNoteViewModes } from './features/settings/useNoteViewModes.js'

type Theme = 'light' | 'dark'
type ViewMode = 'edit' | 'split' | 'preview'
type FileType = 'note' | 'image' | 'audio' | 'video' | 'binary'
type RightPanel = 'backlinks' | 'settings' | null
type View = 'editor' | 'graph'

export interface Tab {
  path: string
  title: string
  unsaved: boolean
  viewMode: ViewMode
  fileType: FileType
}

export interface Pane {
  id: string
  tabs: Tab[]
  activeTabPath: string | null
  flex: number
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])

function detectFileType(path: string): FileType {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'binary'
}

const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-md text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
const iconBtnActive = 'w-8 h-8 flex items-center justify-center rounded-md text-sm bg-accent/10 text-accent'

export function App() {
  const { authState, logout } = useAuth()
  const {
    state, openVault, openServerVault, openElectronVault, closeVault,
    readFile, writeFile, writeBinaryFile, readFileAsBlob,
    createNote, createFolder, deleteFile, deleteFolder, renameFile, renameFolder, renameVault,
    canRenameFolder, refreshVault,
  } = useVault()
  const isElectron = !!window.electronAPI
  const isNative = Capacitor.isNativePlatform()

  const [panes, setPanes] = useState<Pane[]>([{ id: 'p0', tabs: [], activeTabPath: null, flex: 1 }])
  const [activePaneId, setActivePaneId] = useState<string>('p0')
  const tabContents = useRef<Map<string, string>>(new Map())
  const loadingPaths = useRef<Set<string>>(new Set())
  const panesContainerRef = useRef<HTMLDivElement>(null)

  const [linkGraph, setLinkGraph] = useState<LinkGraph | null>(null)
  const { prefs, update: updatePrefs } = usePreferences()
  const noteViewModes = useNoteViewModes()
  const theme = prefs.theme
  const sidebarOpen = prefs.sidebarOpen
  const setTheme = (t: Theme) => updatePrefs({ theme: t })
  const setSidebarOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    updatePrefs({ sidebarOpen: typeof v === 'function' ? v(prefs.sidebarOpen) : v })
  }
  const [rightPanel, setRightPanel] = useState<RightPanel>('backlinks')
  const [view, setView] = useState<View>('editor')

  const { settings, saveSettings, clearSettings } = useSyncSettings()
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

  // Version methods from adapter (only ServerAdapter implements them)
  const adapter = state.status === 'ready' ? state.adapter : null
  const listVersions = adapter?.listVersions?.bind(adapter)
  const readVersion = adapter?.readVersion?.bind(adapter)
  const restoreVersion = adapter?.restoreVersion?.bind(adapter)

  // Derived
  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0]
  const selectedPath = activePane?.activeTabPath ?? null

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

  const openInPane = useCallback(async (paneId: string, path: string, fileType: FileType = 'note') => {
    if (state.status !== 'ready') return
    setActivePaneId(paneId)
    const viewMode: ViewMode = fileType === 'note'
      ? noteViewModes.get(path, prefs.defaultViewMode)
      : 'preview'
    setPanes((prev) => {
      const pane = prev.find((p) => p.id === paneId)
      if (!pane) return prev
      if (pane.tabs.some((t) => t.path === path)) {
        return prev.map((p) => p.id === paneId ? { ...p, activeTabPath: path } : p)
      }
      const title = path.split('/').pop()?.replace(/\.md$/, '') ?? path
      return prev.map((p) =>
        p.id === paneId
          ? { ...p, tabs: [...p.tabs, { path, title, unsaved: false, viewMode, fileType }], activeTabPath: path }
          : p
      )
    })
    // Only load text content for note-type tabs
    if (fileType === 'note' && !tabContents.current.has(path) && !loadingPaths.current.has(path)) {
      loadingPaths.current.add(path)
      try {
        const content = await readFile(path)
        tabContents.current.set(path, content)
      } catch {
        tabContents.current.set(path, '')
      } finally {
        loadingPaths.current.delete(path)
      }
    }
  }, [state.status, readFile, noteViewModes, prefs.defaultViewMode])

  const openInTab = useCallback((path: string, fileType: FileType = 'note') =>
    openInPane(activePaneId, path, fileType), [activePaneId, openInPane])

  const closeTab = useCallback((paneId: string, path: string) => {
    setPanes((prev) => {
      const usedElsewhere = prev.some((p) => p.id !== paneId && p.tabs.some((t) => t.path === path))
      if (!usedElsewhere) tabContents.current.delete(path)
      return prev.flatMap((p) => {
        if (p.id !== paneId) return [p]
        const next = p.tabs.filter((t) => t.path !== path)
        if (next.length === 0 && prev.length > 1) return []
        const newActive =
          p.activeTabPath === path
            ? (next[0]?.path ?? null)
            : p.activeTabPath
        return [{ ...p, tabs: next, activeTabPath: newActive }]
      })
    })
    setActivePaneId((prev) => {
      // If the closed tab's pane was removed, switch to adjacent
      const paneRemoved = panes.find((p) => p.id === paneId)?.tabs.length === 1 && panes.length > 1
      if (paneRemoved && prev === paneId) {
        const idx = panes.findIndex((p) => p.id === paneId)
        return panes[idx - 1]?.id ?? panes[idx + 1]?.id ?? prev
      }
      return prev
    })
  }, [panes])

  const splitPaneWith = useCallback((paneId: string, path: string, direction: 'left' | 'right' = 'left') => {
    const newId = Date.now().toString()
    const title = path.split('/').pop()?.replace(/\.md$/, '') ?? path
    const viewMode = noteViewModes.get(path, prefs.defaultViewMode)
    const newPane: Pane = {
      id: newId,
      tabs: [{ path, title, unsaved: false, viewMode, fileType: 'note' }],
      activeTabPath: path,
      flex: 1,
    }
    setPanes((prev) => {
      const idx = prev.findIndex((p) => p.id === paneId)
      const next = [...prev]
      const insertAt = direction === 'left' ? idx : idx + 1
      next.splice(insertAt, 0, newPane)
      return next
    })
    setActivePaneId(newId)
  }, [noteViewModes, prefs.defaultViewMode])

  const splitPane = useCallback((paneId: string) => {
    const pane = panes.find((p) => p.id === paneId)
    if (!pane?.activeTabPath) return
    const newId = Date.now().toString()
    const path = pane.activeTabPath
    const title = path.split('/').pop()?.replace(/\.md$/, '') ?? path
    const activeTab = pane.tabs.find((t) => t.path === path)
    const viewMode = activeTab?.viewMode ?? prefs.defaultViewMode
    const fileType = activeTab?.fileType ?? 'note'
    const newPane: Pane = {
      id: newId,
      tabs: [{ path, title, unsaved: false, viewMode, fileType }],
      activeTabPath: path,
      flex: 1,
    }
    setPanes((prev) => {
      const idx = prev.findIndex((p) => p.id === paneId)
      const next = [...prev]
      next.splice(idx + 1, 0, newPane)
      return next
    })
    setActivePaneId(newId)
  }, [panes, prefs.defaultViewMode])

  const moveTab = useCallback((fromPaneId: string, path: string, toPaneId: string) => {
    if (fromPaneId === toPaneId) return
    setPanes((prev) => {
      const fromPane = prev.find((p) => p.id === fromPaneId)
      const tab = fromPane?.tabs.find((t) => t.path === path)
      if (!tab) return prev
      return prev.flatMap((p) => {
        if (p.id === fromPaneId) {
          const next = p.tabs.filter((t) => t.path !== path)
          if (next.length === 0 && prev.length > 1) return []
          const newActive = p.activeTabPath === path ? (next[0]?.path ?? null) : p.activeTabPath
          return [{ ...p, tabs: next, activeTabPath: newActive }]
        }
        if (p.id === toPaneId) {
          if (p.tabs.some((t) => t.path === path)) return [{ ...p, activeTabPath: path }]
          return [{ ...p, tabs: [...p.tabs, tab], activeTabPath: path }]
        }
        return [p]
      })
    })
    setActivePaneId(toPaneId)
  }, [])

  const handleViewModeChange = useCallback((path: string, mode: ViewMode) => {
    noteViewModes.set(path, mode)
    setPanes((prev) => prev.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => t.path === path ? { ...t, viewMode: mode } : t),
    })))
  }, [noteViewModes])

  const handleDraftChange = useCallback((path: string, content: string) => {
    tabContents.current.set(path, content)
    setPanes((prev) => prev.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => t.path === path ? { ...t, unsaved: true } : t),
    })))
  }, [])

  const handleAfterRestore = useCallback((path: string, content: string) => {
    // Update cache so re-opening the tab shows restored content
    tabContents.current.set(path, content)
  }, [])

  const handleSave = useCallback(async (path: string, content: string) => {
    await writeFile(path, content)
    tabContents.current.set(path, content)
    setPanes((prev) => prev.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => t.path === path ? { ...t, unsaved: false } : t),
    })))
    if (state.status === 'ready') {
      buildLinkGraph([...state.vault.files.values()], readFile).then(setLinkGraph).catch(console.error)
    }
  }, [writeFile, state, readFile])

  const handleSelectFile = useCallback((file: VaultFile) => {
    if (file.type === 'markdown' || file.type === 'excalidraw') {
      openInTab(file.path, 'note')
    } else {
      openInTab(file.path, detectFileType(file.path))
    }
  }, [openInTab])

  const handleWikiLinkClick = useCallback(
    async (target: string) => {
      if (state.status !== 'ready') return
      const files = [...state.vault.files.values()]
      const resolved = resolveLink(target, selectedPath ?? '', files)
      if (resolved) {
        openInTab(resolved, 'note')
      } else {
        const name = target.endsWith('.md') ? target : `${target}.md`
        await createNote(name, `# ${target}\n`)
        openInTab(name, 'note')
      }
    },
    [state, selectedPath, createNote, openInTab],
  )

  const handleNewNote = useCallback(
    async (name: string) => {
      if (state.status !== 'ready') return
      await createNote(name, `# ${name.replace(/(?:.*\/)?([^/]+)\.md$/, '$1')}\n`)
      openInTab(name, 'note')
    },
    [state, createNote, openInTab],
  )

  const handleNewFolder = useCallback(
    async (path: string) => {
      if (state.status !== 'ready') return
      await createFolder(path)
    },
    [state, createFolder],
  )

  const handleDeleteFile = useCallback(async (path: string) => {
    await deleteFile(path)
    tabContents.current.delete(path)
    setPanes((prev) => prev.flatMap((p) => {
      const next = p.tabs.filter((t) => t.path !== path)
      if (next.length === 0 && prev.length > 1) return []
      return [{ ...p, tabs: next, activeTabPath: next[0]?.path ?? null }]
    }))
  }, [deleteFile])

  const handleDeleteFolder = useCallback(async (folderPath: string) => {
    await deleteFolder(folderPath)
    setPanes((prev) => prev.flatMap((p) => {
      const next = p.tabs.filter((t) => !t.path.startsWith(folderPath + '/'))
      if (next.length === 0 && prev.length > 1) return []
      return [{ ...p, tabs: next, activeTabPath: next[0]?.path ?? null }]
    }))
  }, [deleteFolder])

  const handleRenameFile = useCallback(async (oldPath: string, newPath: string) => {
    await renameFile(oldPath, newPath)
    const content = tabContents.current.get(oldPath)
    if (content !== undefined) {
      tabContents.current.set(newPath, content)
      tabContents.current.delete(oldPath)
    }
    setPanes((prev) => prev.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => t.path === oldPath
        ? { ...t, path: newPath, title: newPath.split('/').pop()?.replace(/\.md$/, '') ?? newPath }
        : t),
      activeTabPath: p.activeTabPath === oldPath ? newPath : p.activeTabPath,
    })))
  }, [renameFile])

  const handleRenameFolder = useCallback(async (oldPath: string, newPath: string) => {
    await renameFolder(oldPath, newPath)
    setPanes((prev) => prev.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => t.path.startsWith(oldPath + '/')
        ? { ...t, path: newPath + t.path.slice(oldPath.length), title: (newPath + t.path.slice(oldPath.length)).split('/').pop()?.replace(/\.md$/, '') ?? t.title }
        : t),
      activeTabPath: p.activeTabPath?.startsWith(oldPath + '/')
        ? newPath + p.activeTabPath.slice(oldPath.length)
        : p.activeTabPath,
    })))
  }, [renameFolder])

  const handleRenameVault = useCallback(async (newName: string) => {
    await renameVault(newName)
  }, [renameVault])

  const handleDownloadZip = useCallback(async () => {
    if (state.status !== 'ready') return
    const { zipSync, strToU8 } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    for (const [path, file] of state.vault.files) {
      try {
        if (file.type === 'markdown' || file.type === 'excalidraw') {
          const content = await readFile(path)
          files[path] = strToU8(content)
        } else {
          const blobUrl = await readFileAsBlob(path)
          const resp = await fetch(blobUrl)
          const buf = await resp.arrayBuffer()
          files[path] = new Uint8Array(buf)
        }
      } catch { /* skip */ }
    }
    const zipped = zipSync(files)
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.vault.name}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }, [state, readFile, readFileAsBlob])

  const handleSplitterResize = useCallback((leftId: string, rightId: string, deltaX: number) => {
    const containerWidth = panesContainerRef.current?.clientWidth ?? 800
    setPanes((prev) => {
      const totalFlex = prev.reduce((s, p) => s + p.flex, 0)
      const flexPerPixel = totalFlex / containerWidth
      return prev.map((p) => {
        if (p.id === leftId) return { ...p, flex: Math.max(0.1, p.flex + deltaX * flexPerPixel) }
        if (p.id === rightId) return { ...p, flex: Math.max(0.1, p.flex - deltaX * flexPerPixel) }
        return p
      })
    })
  }, [])

  const resolveAttachment = useCallback(
    async (path: string) => {
      try { return await readFileAsBlob(path) } catch { return '' }
    },
    [readFileAsBlob],
  )

  // Ctrl+W closes active tab in active pane
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && activePane?.activeTabPath) {
        e.preventDefault()
        closeTab(activePaneId, activePane.activeTabPath)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [activePaneId, activePane, closeTab])

  const backlinks =
    linkGraph && selectedPath ? getBacklinks(linkGraph, selectedPath) : []

  // ── Vault picker splash ───────────────────────────────────────────────────
  if (state.status === 'idle') {
    if (isElectron || isNative) {
      return (
        <MultiAccountVaultPicker
          onOpenServerVault={openServerVault}
          onOpenLocalVault={isElectron ? openElectronVault : undefined}
        />
      )
    }
    if (!authState) return <LoginPage />
    return (
      <VaultPicker
        onOpenVault={openVault}
        onOpenServerVault={openServerVault}
        onSaveSettings={saveSettings}
        authState={authState}
        logout={logout}
      />
    )
  }

  if (!authState && !isElectron && !isNative) return <LoginPage />

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
        <button onClick={openVault} className="px-4 py-2 bg-accent text-white rounded-md">
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
      <header className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 shrink-0 z-10">
        <button onClick={closeVault} className={iconBtn} title="Back to vaults">
          <img src="/icon.svg" className="w-5 h-5" alt="" />
        </button>
        <button onClick={() => setSidebarOpen((v) => !v)} className={iconBtn} title="Toggle file tree">
          ☰
        </button>
        <span className="font-medium text-sm text-gray-700 dark:text-gray-300 truncate flex-1 mx-1">{vault.name}</span>
        <button onClick={refreshVault} className={iconBtn} title="Refresh vault">↻</button>
        <button
          onClick={() => setView((v) => (v === 'graph' ? 'editor' : 'graph'))}
          className={view === 'graph' ? iconBtnActive : iconBtn}
          title="Toggle graph view"
        >
          ⬡
        </button>
        <button
          onClick={() => setRightPanel((p) => (p === 'backlinks' ? null : 'backlinks'))}
          className={rightPanel === 'backlinks' ? iconBtnActive : iconBtn}
          title="Toggle backlinks"
        >
          ⇠
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button
          onClick={() => setRightPanel((p) => (p === 'settings' ? null : 'settings'))}
          className={rightPanel === 'settings' ? iconBtnActive : iconBtn}
          title="Settings"
        >
          ⚙
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <aside className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-hidden flex flex-col">
            <FileTree
              tree={vault.tree}
              selectedPath={selectedPath}
              vaultName={vault.name}
              onSelect={handleSelectFile}
              onNewNote={handleNewNote}
              onNewFolder={handleNewFolder}
              onDeleteFile={handleDeleteFile}
              onDeleteFolder={handleDeleteFolder}
              onRenameFile={handleRenameFile}
              onRenameFolder={canRenameFolder ? handleRenameFolder : undefined}
              onRenameVault={handleRenameVault}
              onDownloadZip={handleDownloadZip}
            />
          </aside>
        )}

        {view === 'graph' && linkGraph ? (
          <GraphView
            files={[...state.vault.files.values()].filter((f) => f.type === 'markdown')}
            linkGraph={linkGraph}
            selectedPath={selectedPath}
            onNavigate={(path) => { openInTab(path, 'note'); setView('editor') }}
            readFile={readFile}
          />
        ) : (
          <>
            {/* Panes row */}
            <div ref={panesContainerRef} className="flex flex-1 min-w-0 min-h-0">
              {panes.map((pane, idx) => (
                <React.Fragment key={pane.id}>
                  {idx > 0 && (
                    <PaneSplitter
                      onDelta={(dx) => handleSplitterResize(panes[idx - 1].id, pane.id, dx)}
                    />
                  )}
                  <PaneContainer
                    pane={pane}
                    flex={pane.flex}
                    isActive={pane.id === activePaneId}
                    tabContents={tabContents}
                    onActivate={() => setActivePaneId(pane.id)}
                    onTabSelect={(path) => openInPane(pane.id, path)}
                    onTabClose={(path) => closeTab(pane.id, path)}
                    onTabDrop={(path, fromPaneId) => moveTab(fromPaneId, path, pane.id)}
                    onSplit={() => splitPane(pane.id)}
                    onSplitWith={(path, direction) => splitPaneWith(pane.id, path, direction)}
                    onSave={handleSave}
                    onDraftChange={handleDraftChange}
                    onViewModeChange={handleViewModeChange}
                    onWikiLinkClick={handleWikiLinkClick}
                    writeBinaryFile={writeBinaryFile}
                    resolveAttachment={resolveAttachment}
                    refreshVault={refreshVault}
                    listVersions={listVersions}
                    readVersion={readVersion}
                    restoreVersion={restoreVersion}
                    onAfterRestore={handleAfterRestore}
                  />
                </React.Fragment>
              ))}
            </div>

            {/* Right panel */}
            {rightPanel && (
              <aside className="w-72 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-hidden">
                {rightPanel === 'backlinks' && selectedPath && (
                  <BacklinksPanel
                    currentPath={selectedPath}
                    backlinks={backlinks}
                    onNavigate={openInTab}
                    onClose={() => setRightPanel(null)}
                  />
                )}
                {rightPanel === 'settings' && (
                  <SettingsPanel
                    theme={theme}
                    onThemeChange={setTheme}
                    defaultViewMode={prefs.defaultViewMode}
                    onDefaultViewModeChange={(m) => updatePrefs({ defaultViewMode: m })}
                    vaultName={vault.name}
                    onChangeVault={closeVault}
                    syncSettings={effectiveSettings}
                    authToken={authState?.token}
                    syncStatus={syncStatus}
                    syncLastSynced={lastSynced}
                    syncError={syncError}
                    onSaveSettings={saveSettings}
                    onClearSettings={clearSettings}
                    onSync={sync}
                    authState={authState}
                    isElectron={isElectron}
                    isNative={isNative}
                    onClose={() => setRightPanel(null)}
                  />
                )}
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  )
}
