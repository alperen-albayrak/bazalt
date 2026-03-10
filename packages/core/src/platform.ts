import type { VaultFile } from './vault.js'

export interface FileVersion {
  id: number
  hash: string
  size: number
  createdAt: string
}

export interface PlatformAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>
  readFileAsBlob(path: string): Promise<string>
  listFiles(): Promise<VaultFile[]>
  watchVault?(onChange: () => void): () => void
  createFolder?(path: string): Promise<void>
  listVersions?(path: string): Promise<FileVersion[]>
  readVersion?(path: string, id: number): Promise<string>
  restoreVersion?(path: string, id: number): Promise<void>
}
