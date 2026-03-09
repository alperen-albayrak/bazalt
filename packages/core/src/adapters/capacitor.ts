import type { PlatformAdapter } from '../platform.js'
import type { VaultFile } from '../vault.js'

/**
 * CapacitorAdapter — stub for Phase 4.5 (local vault on mobile).
 * Mobile is currently server-first; use ServerAdapter for vault I/O.
 * This is groundwork for offline local vaults via @capacitor/filesystem.
 *
 * To complete this adapter (Phase 4.5):
 *   1. Add @capacitor/filesystem to apps/app package.json
 *   2. Replace stubs below with real Filesystem calls (Directory.Documents).
 */
export class CapacitorAdapter implements PlatformAdapter {
  constructor(private readonly root: string) {}

  async listFiles(): Promise<VaultFile[]> {
    throw new Error('CapacitorAdapter not yet implemented — use ServerAdapter on mobile')
  }

  async readFile(_path: string): Promise<string> {
    throw new Error('CapacitorAdapter not yet implemented — use ServerAdapter on mobile')
  }

  async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error('CapacitorAdapter not yet implemented — use ServerAdapter on mobile')
  }

  async writeBinaryFile(_path: string, _data: ArrayBuffer): Promise<void> {
    throw new Error('CapacitorAdapter not yet implemented — use ServerAdapter on mobile')
  }

  async readFileAsBlob(_path: string): Promise<string> {
    throw new Error('CapacitorAdapter not yet implemented — use ServerAdapter on mobile')
  }
}
