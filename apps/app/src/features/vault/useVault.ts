import { useState, useCallback } from 'react'
import { buildVaultFile, buildTree, type Vault, type VaultFile, type VaultFolder } from '@bazalt/core'

export type VaultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; vault: Vault; dirHandle: FileSystemDirectoryHandle }
  | { status: 'error'; message: string }

/** Open a vault folder via the File System Access API */
export function useVault() {
  const [state, setState] = useState<VaultState>({ status: 'idle' })

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
      const vault: Vault = {
        root: dirHandle.name,
        name: dirHandle.name,
        files: fileMap,
        tree,
      }
      setState({ status: 'ready', vault, dirHandle })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setState({ status: 'idle' })
        return
      }
      setState({ status: 'error', message: String(err) })
    }
  }, [])

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      return readFileFromHandle(state.dirHandle, path)
    },
    [state],
  )

  const writeFile = useCallback(
    async (path: string, content: string): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      return writeFileToHandle(state.dirHandle, path, content)
    },
    [state],
  )

  const refreshVault = useCallback(async () => {
    if (state.status !== 'ready') return
    const { dirHandle } = state
    const files = await scanDirectory(dirHandle, '')
    const fileMap = new Map(files.map((f) => [f.path, f]))
    const tree = buildTree(dirHandle.name, files)
    setState((prev) => {
      if (prev.status !== 'ready') return prev
      return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
    })
  }, [state])

  /** Create a new note, write initial content, and add it to the vault state. */
  const createNote = useCallback(
    async (path: string, initialContent = ''): Promise<void> => {
      if (state.status !== 'ready') throw new Error('No vault open')
      await writeFileToHandle(state.dirHandle, path, initialContent)
      // Refresh vault state so new file appears in tree
      const { dirHandle } = state
      const files = await scanDirectory(dirHandle, '')
      const fileMap = new Map(files.map((f) => [f.path, f]))
      const tree = buildTree(dirHandle.name, files)
      setState((prev) => {
        if (prev.status !== 'ready') return prev
        return { ...prev, vault: { ...prev.vault, files: fileMap, tree } }
      })
    },
    [state],
  )

  return { state, openVault, readFile, writeFile, createNote, refreshVault }
}

async function scanDirectory(
  handle: FileSystemDirectoryHandle,
  prefix: string,
): Promise<VaultFile[]> {
  const files: VaultFile[] = []
  for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    // Skip hidden folders like .obsidian, .git
    if (name.startsWith('.')) continue

    const path = prefix ? `${prefix}/${name}` : name

    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()
      files.push(buildVaultFile(path, file.lastModified, file.size))
    } else if (entry.kind === 'directory') {
      const sub = await (handle.getDirectoryHandle as (name: string) => Promise<FileSystemDirectoryHandle>)(name)
      files.push(...(await scanDirectory(sub, path)))
    }
  }
  return files
}

async function readFileFromHandle(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<string> {
  const parts = path.split('/')
  let dir: FileSystemDirectoryHandle = root
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i])
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
  const file = await fileHandle.getFile()
  return file.text()
}

async function writeFileToHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string,
): Promise<void> {
  const parts = path.split('/')
  let dir: FileSystemDirectoryHandle = root
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true })
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await (fileHandle as FileSystemFileHandle & {
    createWritable: () => Promise<FileSystemWritableFileStream>
  }).createWritable()
  await writable.write(content)
  await writable.close()
}

export type { VaultFolder }
