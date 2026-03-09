import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'
import chokidar from 'chokidar'

const ACCOUNTS_PATH = nodePath.join(app.getPath('userData'), 'accounts.json')

interface VaultFile {
  path: string
  name: string
  ext: string
  type: 'markdown' | 'canvas' | 'excalidraw' | 'attachment' | 'unknown'
  mtime: number
  size: number
}

function getFileType(name: string): VaultFile['type'] {
  if (name.endsWith('.excalidraw.md') || name.endsWith('.excalidraw')) return 'excalidraw'
  if (name.endsWith('.canvas')) return 'canvas'
  if (name.endsWith('.md')) return 'markdown'
  const textExts = ['.txt', '.css', '.js', '.ts', '.json', '.yaml', '.yml', '.toml']
  const ext = name.slice(name.lastIndexOf('.'))
  if (textExts.includes(ext)) return 'attachment'
  return 'unknown'
}

function makeVaultFile(relativePath: string, stat: { mtimeMs: number; size: number }): VaultFile {
  const name = relativePath.split('/').pop() ?? relativePath
  const dotIdx = name.indexOf('.')
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : ''
  return {
    path: relativePath,
    name,
    ext,
    type: getFileType(name),
    mtime: Math.round(stat.mtimeMs),
    size: stat.size,
  }
}

async function scanDir(root: string, prefix: string): Promise<VaultFile[]> {
  const files: VaultFile[] = []
  const entries = await fs.readdir(nodePath.join(root, prefix), { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const abs = nodePath.join(root, rel)
    if (entry.isDirectory()) {
      files.push(...(await scanDir(root, rel)))
    } else if (entry.isFile()) {
      const stat = await fs.stat(abs)
      files.push(makeVaultFile(rel, stat))
    }
  }
  return files
}

// Track active watchers so we don't double-watch the same root
const watchers = new Map<string, ReturnType<typeof chokidar.watch>>()

export function registerIpcHandlers() {
  ipcMain.handle('vault:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Vault Folder',
    })
    if (canceled || filePaths.length === 0) {
      const err = new Error('AbortError')
      err.name = 'AbortError'
      throw err
    }
    const root = filePaths[0]
    const files = await scanDir(root, '')
    return { root, files }
  })

  ipcMain.handle('vault:listFiles', async (_event, root: string) => {
    return scanDir(root, '')
  })

  ipcMain.handle('vault:readFile', async (_event, root: string, path: string) => {
    const abs = nodePath.join(root, path)
    return fs.readFile(abs, 'utf-8')
  })

  ipcMain.handle('vault:writeFile', async (_event, root: string, path: string, content: string) => {
    const abs = nodePath.join(root, path)
    await fs.mkdir(nodePath.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf-8')
  })

  ipcMain.handle('vault:writeBinaryFile', async (_event, root: string, path: string, data: Uint8Array) => {
    const abs = nodePath.join(root, path)
    await fs.mkdir(nodePath.dirname(abs), { recursive: true })
    await fs.writeFile(abs, data)
  })

  ipcMain.handle('vault:readFileAsBuffer', async (_event, root: string, path: string) => {
    const abs = nodePath.join(root, path)
    return fs.readFile(abs)
  })

  // ── Accounts persistence ──────────────────────────────────────────────────

  ipcMain.handle('accounts:load', async () => {
    try {
      const data = await fs.readFile(ACCOUNTS_PATH, 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  })

  ipcMain.handle('accounts:save', async (_event, accounts: unknown) => {
    await fs.mkdir(nodePath.dirname(ACCOUNTS_PATH), { recursive: true })
    await fs.writeFile(ACCOUNTS_PATH, JSON.stringify(accounts, null, 2), 'utf-8')
  })

  // ── File watcher ──────────────────────────────────────────────────────────

  ipcMain.on('vault:watch', (event, root: string) => {
    if (watchers.has(root)) return
    const watcher = chokidar.watch(root, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
    })
    watcher.on('all', () => {
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.webContents.send('vault:changed')
    })
    watchers.set(root, watcher)
  })
}
