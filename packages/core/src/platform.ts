import type { VaultFile } from './vault.js'

export interface PlatformAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  writeBinaryFile(path: string, data: ArrayBuffer): Promise<void>
  readFileAsBlob(path: string): Promise<string>
  listFiles(): Promise<VaultFile[]>
  watchVault?(onChange: () => void): () => void
}
