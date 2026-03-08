import { useState, useCallback } from 'react'
import { SyncClient, sha256 } from '@bazalt/sync'
import type { SyncSettings } from './useSyncSettings.js'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export function useSync(
  settings: SyncSettings | null,
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, content: string) => Promise<void>,
  filePaths: string[],
) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sync = useCallback(async () => {
    if (!settings) return
    setStatus('syncing')
    setError(null)

    try {
      const client = new SyncClient(settings)

      // 1. Build local hash map
      const localHashes = new Map<string, string>()
      await Promise.all(
        filePaths.map(async (filePath) => {
          const content = await readFile(filePath)
          localHashes.set(filePath, await sha256(content))
        }),
      )

      // 2. Ask server what differs
      const { pull, push } = await client.getChanges(localHashes)

      // 3. Pull server-newer files (last-write-wins)
      for (const path of pull) {
        const content = await client.getFile(path)
        await writeFile(path, content)
      }

      // 4. Push local-only files
      if (push.length > 0) {
        const files = await Promise.all(
          push.map(async (path) => ({ path, content: await readFile(path) })),
        )
        await client.pushFiles(files)
      }

      setLastSynced(new Date())
      setStatus('success')
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }, [settings, readFile, writeFile, filePaths])

  return { status, lastSynced, error, sync }
}
