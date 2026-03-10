import type { PlatformAdapter } from '../platform.js'
import { buildVaultFile, type VaultFile } from '../vault.js'

export class WebAdapter implements PlatformAdapter {
  constructor(private readonly dirHandle: FileSystemDirectoryHandle) {}

  async listFiles(): Promise<VaultFile[]> {
    return scanDirectory(this.dirHandle, '')
  }

  async readFile(path: string): Promise<string> {
    const parts = path.split('/')
    let dir: FileSystemDirectoryHandle = this.dirHandle
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i])
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
    return (await fileHandle.getFile()).text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    const parts = path.split('/')
    let dir: FileSystemDirectoryHandle = this.dirHandle
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create: true })
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await (fileHandle as FileSystemFileHandle & {
      createWritable: () => Promise<FileSystemWritableFileStream>
    }).createWritable()
    await writable.write(content)
    await writable.close()
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    const parts = path.split('/')
    let dir: FileSystemDirectoryHandle = this.dirHandle
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true })
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await (fileHandle as FileSystemFileHandle & {
      createWritable: () => Promise<FileSystemWritableFileStream>
    }).createWritable()
    await writable.write(data)
    await writable.close()
  }

  async readFileAsBlob(path: string): Promise<string> {
    const parts = path.split('/')
    let dir: FileSystemDirectoryHandle = this.dirHandle
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i])
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
    const file = await fileHandle.getFile()
    const buffer = await file.arrayBuffer()
    return URL.createObjectURL(new Blob([buffer], { type: file.type }))
  }

  async createFolder(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    let dir: FileSystemDirectoryHandle = this.dirHandle
    for (const segment of parts) {
      dir = await dir.getDirectoryHandle(segment, { create: true })
    }
  }

  private async parentAndName(filePath: string): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const parts = filePath.split('/')
    const name = parts.pop()!
    let dir: FileSystemDirectoryHandle = this.dirHandle
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: false })
    return { dir, name }
  }

  async deleteFile(path: string): Promise<void> {
    const { dir, name } = await this.parentAndName(path)
    await dir.removeEntry(name)
  }

  async deleteFolder(path: string): Promise<void> {
    const { dir, name } = await this.parentAndName(path)
    await (dir as FileSystemDirectoryHandle & {
      removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>
    }).removeEntry(name, { recursive: true })
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const content = await this.readFile(oldPath)
    await this.writeFile(newPath, content)
    const { dir, name } = await this.parentAndName(oldPath)
    await dir.removeEntry(name)
  }
}

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
