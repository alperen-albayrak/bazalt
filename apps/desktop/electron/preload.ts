import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openVaultFolder: () => ipcRenderer.invoke('vault:open'),

  listFiles: (root: string) => ipcRenderer.invoke('vault:listFiles', root),

  readFile: (root: string, path: string) =>
    ipcRenderer.invoke('vault:readFile', root, path),

  writeFile: (root: string, path: string, content: string) =>
    ipcRenderer.invoke('vault:writeFile', root, path, content),

  writeBinaryFile: (root: string, path: string, data: Uint8Array) =>
    ipcRenderer.invoke('vault:writeBinaryFile', root, path, data),

  readFileAsBuffer: (root: string, path: string) =>
    ipcRenderer.invoke('vault:readFileAsBuffer', root, path),

  createFolder: (root: string, path: string) =>
    ipcRenderer.invoke('vault:createFolder', root, path),

  watchVault: (root: string) => ipcRenderer.send('vault:watch', root),

  onVaultChanged: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('vault:changed', handler)
    // Return a cleanup function
    return () => ipcRenderer.removeListener('vault:changed', handler)
  },

  accounts: {
    load: () => ipcRenderer.invoke('accounts:load'),
    save: (accounts: unknown) => ipcRenderer.invoke('accounts:save', accounts),
  },
})
