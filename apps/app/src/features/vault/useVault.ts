import { useState, useCallback } from 'react'
import {
  buildTree,
  type Vault,
  type VaultFile,
  type VaultFolder,
  type PlatformAdapter,
  WebAdapter,
  ServerAdapter,
  ElectronAdapter,
} from '@bazalt/core'

export type VaultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; vault: Vault; adapter: PlatformAdapter }
  | { status: 'error'; message: string }

export function useVault() {
  const [state, setState] = useState<VaultState>({ status: 'idle' })

  // ── Shared: open with any adapter ─────────────────────────────────────────

  const _openWithAdapter = useCallback(async (adapter: PlatformAdapter, vaultName: string) => {
    const files = await adapter.listFiles()
    const fileMap = new Map(files.map((f) => [f.path, f]))
    const tree = buildTree(vaultName, files)
    const vault: Vault = { root: vaultName, name: vaultName, files: fileMap, tree }
    setState({ status: 'ready', vault, adapter })
  }, [])

  // ── Local (File System Access API) ────────────────────────────────────────

  const openVault = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      setState({ status: 'error', message: 'File System Access API not supported in this browser.' })
      return
    }
    try {
      setState({ status: 'loading' })
      const dirHandle = await (window as Window & typeof globalThis & {
        showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>
      }).showDirectoryPicker({ mode: 'readwrite' })
      await _openWithAdapter(new WebAdapter(dirHandle), dirHandle.name)
    } catch (err) {
      if ((err as Error).name === 'AbortError') { setState({ status: 'idle' }); return }
      setState({ status: 'error', message: String(err) })
    }
  }, [_openWithAdapter])

  // ── Server vault ──────────────────────────────────────────────────────────

  const openServerVault = useCallback(async (
    serverUrl: string,
    token: string,
    vaultId: string,
    vaultName: string,
  ) => {
    try {
      setState({ status: 'loading' })
      await _openWithAdapter(new ServerAdapter(serverUrl, token, vaultId), vaultName)
    } catch (err) {
      setState({ status: 'error', message: String(err) })
    }
  }, [_openWithAdapter])

  // ── Electron vault ────────────────────────────────────────────────────────

  const openElectronVault = useCallback(async () => {
    try {
      setState({ status: 'loading' })
      if (!window.electronAPI) throw new Error('Not running in Electron')
      // Open dialog and get root path + initial file list from main process
      const { root, files } = await window.electronAPI.openVaultFolder()
      const name = root.split('/').pop() ?? root
      const adapter = new ElectronAdapter(root)
      const fileMap = new Map(files.map((f: VaultFile) => [f.path, f]))
      const tree = buildTree(name, files)
      const vault: Vault = { root, name, files: fileMap, tree }
      setState({ status: 'ready', vault, adapter })
    } catch (err) {
      if ((err as Error).name === 'AbortError') { setState({ status: 'idle' }); return }
      setState({ status: 'error', message: String(err) })
    }
  }, [])

  // ── Shared operations ─────────────────────────────────────────────────────

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      return state.adapter.readFile(path)
    },
    [state],
  )

  const writeFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      return state.adapter.writeFile(path, content)
    },
    [state],
  )

  const readFileAsBlob = useCallback(
    async (path: string): Promise<string> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      return state.adapter.readFileAsBlob(path)
    },
    [state],
  )

  const writeBinaryFile = useCallback(
    async (path: string, data: ArrayBuffer): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      return state.adapter.writeBinaryFile(path, data)
    },
    [state],
  )

  const refreshVault = useCallback(async () => {
    if (state.status !== 'ready') return
    const { adapter, vault } = state
    const files = await adapter.listFiles()
    const fileMap = new Map(files.map((f) => [f.path, f]))
    const tree = buildTree(vault.name, files)
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
    })
  }, [state])

  const createNote = useCallback(
    async (path: string, initialContent = ''): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      await state.adapter.writeFile(path, initialContent)
      await refreshVault()
    },
    [state, refreshVault],
  )

  const createFolder = useCallback(
    async (path: string): Promise<void> => {
      if (state.status !== 'ready') return
      if (state.adapter.createFolder) await state.adapter.createFolder(path)
      await refreshVault()
    },
    [state, refreshVault],
  )

  const closeVault = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  return {
    state,
    openVault,
    openServerVault,
    openElectronVault,
    closeVault,
    readFile,
    writeFile,
    writeBinaryFile,
    readFileAsBlob,
    createNote,
    createFolder,
    refreshVault,
  }
}

export type { VaultFolder }
