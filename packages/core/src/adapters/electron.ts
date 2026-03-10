import type { PlatformAdapter } from '../platform.js'
import type { VaultFile } from '../vault.js'
import type { SavedAccount } from '../accounts.js'

/** Shape exposed by the preload script via contextBridge */
export interface ElectronAPI {
  openVaultFolder(): Promise<{ root: string; files: VaultFile[] }>
  readFile(root: string, path: string): Promise<string>
  writeFile(root: string, path: string, content: string): Promise<void>
  writeBinaryFile(root: string, path: string, data: Uint8Array): Promise<void>
  readFileAsBuffer(root: string, path: string): Promise<Uint8Array>
  listFiles(root: string): Promise<VaultFile[]>
  watchVault(root: string): void
  onVaultChanged(cb: () => void): () => void
  createFolder(root: string, path: string): Promise<void>
  accounts: {
    load(): Promise<SavedAccount[]>
    save(accounts: SavedAccount[]): Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export class ElectronAdapter implements PlatformAdapter {
  private readonly api: ElectronAPI

  constructor(private readonly root: string) {
    if (!window.electronAPI) throw new Error('window.electronAPI not found — not running in Electron')
    this.api = window.electronAPI
  }

  async listFiles(): Promise<VaultFile[]> {
    return this.api.listFiles(this.root)
  }

  async readFile(path: string): Promise<string> {
    return this.api.readFile(this.root, path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.api.writeFile(this.root, path, content)
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    return this.api.writeBinaryFile(this.root, path, new Uint8Array(data))
  }

  async readFileAsBlob(path: string): Promise<string> {
    const buf = await this.api.readFileAsBuffer(this.root, path)
    return URL.createObjectURL(new Blob([buf.buffer as ArrayBuffer]))
  }

  watchVault(onChange: () => void): () => void {
    this.api.watchVault(this.root)
    return this.api.onVaultChanged(onChange)
  }

  async createFolder(path: string): Promise<void> {
    return this.api.createFolder(this.root, path)
  }
}
