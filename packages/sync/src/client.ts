export interface SyncClientOptions {
  serverUrl: string
  token: string
  vaultId: string
}

export interface RemoteFile {
  path: string
  hash: string
  updatedAt: string
}

export interface SyncChanges {
  pull: string[]
  push: string[]
}

/**
 * Bazalt sync client — thin HTTP client for the server sync API.
 * Used by apps/app (web) and will be used by desktop/mobile later.
 */
export class SyncClient {
  private base: string
  private headers: Record<string, string>
  private vaultId: string

  constructor({ serverUrl, token, vaultId }: SyncClientOptions) {
    this.base = serverUrl.replace(/\/$/, '')
    this.vaultId = vaultId
    this.headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  private url(path: string) {
    return `${this.base}${path}`
  }

  /** List all files on the server for this vault. */
  async listFiles(): Promise<RemoteFile[]> {
    const res = await fetch(this.url(`/api/vaults/${this.vaultId}/files`), {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`listFiles failed: ${res.status}`)
    return res.json()
  }

  /** Get the raw content of a file. */
  async getFile(path: string): Promise<string> {
    const res = await fetch(
      this.url(`/api/vaults/${this.vaultId}/file?path=${encodeURIComponent(path)}`),
      { headers: this.headers },
    )
    if (!res.ok) throw new Error(`getFile failed: ${res.status}`)
    return res.text()
  }

  /** Push a file to the server. */
  async putFile(path: string, content: string): Promise<void> {
    const res = await fetch(this.url(`/api/vaults/${this.vaultId}/file`), {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) throw new Error(`putFile failed: ${res.status}`)
  }

  /**
   * Ask the server which files differ from our local state.
   * @param localFiles map of path → sha256 hash
   */
  async getChanges(localFiles: Map<string, string>): Promise<SyncChanges> {
    const files = [...localFiles.entries()].map(([path, hash]) => ({ path, hash }))
    const res = await fetch(this.url(`/api/vaults/${this.vaultId}/sync/changes`), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ files }),
    })
    if (!res.ok) throw new Error(`getChanges failed: ${res.status}`)
    return res.json()
  }

  /**
   * Push multiple files to the server in one request.
   */
  async pushFiles(files: { path: string; content: string }[]): Promise<void> {
    const res = await fetch(this.url(`/api/vaults/${this.vaultId}/sync/push`), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ files }),
    })
    if (!res.ok) throw new Error(`pushFiles failed: ${res.status}`)
  }
}
