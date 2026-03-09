import type { PlatformAdapter } from '../platform.js'
import { buildVaultFile, type VaultFile } from '../vault.js'

export class ServerAdapter implements PlatformAdapter {
  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly vaultId: string,
  ) {}

  private get headers() {
    return { Authorization: `Bearer ${this.token}` }
  }

  async listFiles(): Promise<VaultFile[]> {
    const res = await fetch(`${this.serverUrl}/api/vaults/${this.vaultId}/files`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`Failed to load vault (${res.status})`)
    const raw: { path: string; size: number; updatedAt: string }[] = await res.json()
    return raw.map((f) => buildVaultFile(f.path, new Date(f.updatedAt).getTime(), f.size))
  }

  async readFile(path: string): Promise<string> {
    const res = await fetch(
      `${this.serverUrl}/api/vaults/${this.vaultId}/file?path=${encodeURIComponent(path)}`,
      { headers: this.headers },
    )
    if (!res.ok) throw new Error(`File not found: ${path}`)
    return res.text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/api/vaults/${this.vaultId}/file`, {
      method: 'PUT',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) throw new Error(`Failed to save file (${res.status})`)
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    const res = await fetch(
      `${this.serverUrl}/api/vaults/${this.vaultId}/file/binary?path=${encodeURIComponent(path)}`,
      {
        method: 'PUT',
        headers: { ...this.headers, 'Content-Type': 'application/octet-stream' },
        body: data,
      },
    )
    if (!res.ok) throw new Error(`Failed to upload file (${res.status})`)
  }

  async readFileAsBlob(path: string): Promise<string> {
    const res = await fetch(
      `${this.serverUrl}/api/vaults/${this.vaultId}/file?path=${encodeURIComponent(path)}`,
      { headers: this.headers },
    )
    if (!res.ok) throw new Error(`File not found: ${path}`)
    const buffer = await res.arrayBuffer()
    return URL.createObjectURL(new Blob([buffer]))
  }
}
