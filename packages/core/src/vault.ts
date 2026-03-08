export type VaultFileType = 'markdown' | 'canvas' | 'excalidraw' | 'attachment' | 'unknown'

export interface VaultFile {
  /** Path relative to vault root, e.g. "folder/Note.md" */
  path: string
  /** Filename without directory, e.g. "Note.md" */
  name: string
  /** File extension including dot, e.g. ".md" */
  ext: string
  /** Logical file type */
  type: VaultFileType
  /** Last modified timestamp (ms since epoch) */
  mtime: number
  /** File size in bytes */
  size: number
}

export interface VaultFolder {
  path: string
  name: string
  children: (VaultFile | VaultFolder)[]
}

export interface Vault {
  /** Absolute path to vault root (Electron/Capacitor) or virtual root (browser) */
  root: string
  /** Display name derived from root folder name */
  name: string
  /** All files flat list */
  files: Map<string, VaultFile>
  /** Folder tree */
  tree: VaultFolder
}

export function getFileType(name: string): VaultFileType {
  if (name.endsWith('.excalidraw.md') || name.endsWith('.excalidraw')) return 'excalidraw'
  if (name.endsWith('.canvas')) return 'canvas'
  if (name.endsWith('.md')) return 'markdown'
  const textExts = ['.txt', '.css', '.js', '.ts', '.json', '.yaml', '.yml', '.toml']
  const ext = name.slice(name.lastIndexOf('.'))
  if (textExts.includes(ext)) return 'attachment'
  return 'unknown'
}

export function buildVaultFile(path: string, mtime: number, size: number): VaultFile {
  const name = path.split('/').pop() ?? path
  const dotIdx = name.indexOf('.')
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : ''
  return { path, name, ext, type: getFileType(name), mtime, size }
}

/** Build a folder tree from a flat list of file paths. */
export function buildTree(root: string, files: VaultFile[]): VaultFolder {
  const rootFolder: VaultFolder = { path: '', name: root.split('/').pop() ?? root, children: [] }

  for (const file of files) {
    const parts = file.path.split('/')
    let current = rootFolder
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      let sub = current.children.find(
        (c): c is VaultFolder => 'children' in c && c.name === part,
      )
      if (!sub) {
        sub = { path: parts.slice(0, i + 1).join('/'), name: part, children: [] }
        current.children.push(sub)
      }
      current = sub
    }
    current.children.push(file)
  }

  sortFolder(rootFolder)
  return rootFolder
}

function sortFolder(folder: VaultFolder): void {
  folder.children.sort((a, b) => {
    const aIsFolder = 'children' in a
    const bIsFolder = 'children' in b
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const child of folder.children) {
    if ('children' in child) sortFolder(child)
  }
}
