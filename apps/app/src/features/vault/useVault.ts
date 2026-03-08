import { useState, useCallback } from 'react'
import { buildVaultFile, buildTree, type Vault, type VaultFile, type VaultFolder } from '@bazalt/core'

export type VaultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; vault: Vault; mode: 'local'; dirHandle: FileSystemDirectoryHandle }
  | { status: 'ready'; vault: Vault; mode: 'server'; serverUrl: string; token: string; vaultId: string }
  | { status: 'error'; message: string }

export function useVault() {
  const [state, setState] = useState<VaultState>({ status: 'idle' })

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
      const files = await scanDirectory(dirHandle, '')
      const fileMap = new Map(files.map((f) => [f.path, f]))
      const tree = buildTree(dirHandle.name, files)
      const vault: Vault = { root: dirHandle.name, name: dirHandle.name, files: fileMap, tree }
      setState({ status: 'ready', vault, mode: 'local', dirHandle })
    } catch (err) {
      if ((err as Error).name === 'AbortError') { setState({ status: 'idle' }); return }
      setState({ status: 'error', message: String(err) })
    }
  }, [])

  // ── Server vault (no local folder needed) ─────────────────────────────────

  const openServerVault = useCallback(async (
    serverUrl: string,
    token: string,
    vaultId: string,
    vaultName: string,
  ) => {
    try {
      setState({ status: 'loading' })
      const res = await fetch(`${serverUrl}/api/vaults/${vaultId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to load vault (${res.status})`)
      const raw: { path: string; size: number; updatedAt: string }[] = await res.json()
      const files = raw.map((f) => buildVaultFile(f.path, new Date(f.updatedAt).getTime(), f.size))
      const fileMap = new Map(files.map((f) => [f.path, f]))
      const tree = buildTree(vaultName, files)
      const vault: Vault = { root: vaultName, name: vaultName, files: fileMap, tree }
      setState({ status: 'ready', vault, mode: 'server', serverUrl, token, vaultId })
    } catch (err) {
      setState({ status: 'error', message: String(err) })
    }
  }, [])

  // ── Shared operations ─────────────────────────────────────────────────────

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      if (state.mode === 'local') return readFileFromHandle(state.dirHandle, path)
      const res = await fetch(
        `${state.serverUrl}/api/vaults/${state.vaultId}/file?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${state.token}` } },
      )
      if (!res.ok) throw new Error(`File not found: ${path}`)
      return res.text()
    },
    [state],
  )

  const writeFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      if (state.mode === 'local') return writeFileToHandle(state.dirHandle, path, content)
      const res = await fetch(`${state.serverUrl}/api/vaults/${state.vaultId}/file`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
      if (!res.ok) throw new Error(`Failed to save file (${res.status})`)
    },
    [state],
  )

  const readFileAsBlob = useCallback(
    async (path: string): Promise<string> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      if (state.mode === 'local') {
        const parts = path.split('/')
        let dir: FileSystemDirectoryHandle = state.dirHandle
        for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i])
        const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
        const file = await fileHandle.getFile()
        const buffer = await file.arrayBuffer()
        return URL.createObjectURL(new Blob([buffer], { type: file.type }))
      }
      const res = await fetch(
        `${state.serverUrl}/api/vaults/${state.vaultId}/file?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${state.token}` } },
      )
      if (!res.ok) throw new Error(`File not found: ${path}`)
      const buffer = await res.arrayBuffer()
      return URL.createObjectURL(new Blob([buffer]))
    },
    [state],
  )

  const writeBinaryFile = useCallback(
    async (path: string, data: ArrayBuffer): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      if (state.mode === 'server') return // binary upload not yet supported in server mode
      const parts = path.split('/')
      let dir: FileSystemDirectoryHandle = state.dirHandle
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true })
      }
      const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
      const writable = await (fileHandle as FileSystemFileHandle & {
        createWritable: () => Promise<FileSystemWritableFileStream>
      }).createWritable()
      await writable.write(data)
      await writable.close()
    },
    [state],
  )

  const refreshVault = useCallback(async () => {
    if (state.status !== 'ready') return
    if (state.mode === 'local') {
      const { dirHandle } = state
      const files = await scanDirectory(dirHandle, '')
      const fileMap = new Map(files.map((f) => [f.path, f]))
      const tree = buildTree(dirHandle.name, files)
      setState((prev) => {
        if (prev.status !== 'ready') return prev
        return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
      })
    } else {
      const { serverUrl, token, vaultId } = state
      const res = await fetch(`${serverUrl}/api/vaults/${vaultId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const raw: { path: string; size: number; updatedAt: string }[] = await res.json()
      const files = raw.map((f) => buildVaultFile(f.path, new Date(f.updatedAt).getTime(), f.size))
      const fileMap = new Map(files.map((f) => [f.path, f]))
      setState((prev) => {
        if (prev.status !== 'ready') return prev
        const tree = buildTree(prev.vault.name, files)
        return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
      })
    }
  }, [state])

  const createNote = useCallback(
    async (path: string, initialContent = ''): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      if (state.mode === 'local') {
        await writeFileToHandle(state.dirHandle, path, initialContent)
        const files = await scanDirectory(state.dirHandle, '')
        const fileMap = new Map(files.map((f) => [f.path, f]))
        const tree = buildTree(state.dirHandle.name, files)
        setState((prev) => {
          if (prev.status !== 'ready') return prev
          return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
        })
      } else {
        const { serverUrl, token, vaultId } = state
        await fetch(`${serverUrl}/api/vaults/${vaultId}/file`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: initialContent }),
        })
        // Refresh file list
        const res = await fetch(`${serverUrl}/api/vaults/${vaultId}/files`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const raw: { path: string; size: number; updatedAt: string }[] = await res.json()
          const files = raw.map((f) => buildVaultFile(f.path, new Date(f.updatedAt).getTime(), f.size))
          const fileMap = new Map(files.map((f) => [f.path, f]))
          setState((prev) => {
            if (prev.status !== 'ready') return prev
            const tree = buildTree(prev.vault.name, files)
            return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
          })
        }
      }
    },
    [state],
  )

  return {
    state,
    openVault,
    openServerVault,
    readFile,
    writeFile,
    writeBinaryFile,
    readFileAsBlob,
    createNote,
    refreshVault,
  }
}

// ── File System Access API helpers ────────────────────────────────────────────

async function scanDirectory(handle: FileSystemDirectoryHandle, prefix: string): Promise<VaultFile[]> {
  const files: VaultFile[] = []
  for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${name}` : name
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      files.push(buildVaultFile(path, file.lastModified, file.size))
    } else if (entry.kind === 'directory') {
      const sub = await (handle.getDirectoryHandle as (name: string) => Promise<FileSystemDirectoryHandle>)(name)
      files.push(...(await scanDirectory(sub, path)))
    }
  }
  return files
}

async function readFileFromHandle(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const parts = path.split('/')
  let dir: FileSystemDirectoryHandle = root
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i])
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
  return (await fileHandle.getFile()).text()
}

async function writeFileToHandle(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const parts = path.split('/')
  let dir: FileSystemDirectoryHandle = root
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create: true })
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await (fileHandle as FileSystemFileHandle & {
    createWritable: () => Promise<FileSystemWritableFileStream>
  }).createWritable()
  await writable.write(content)
  await writable.close()
}

export type { VaultFolder }
