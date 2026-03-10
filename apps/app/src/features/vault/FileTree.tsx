import React, { useState, useEffect } from 'react'
import type { VaultFile, VaultFolder } from '@bazalt/core'

interface FileTreeProps {
  tree: VaultFolder
  selectedPath: string | null
  vaultName: string
  onSelect: (file: VaultFile) => void
  onNewNote: (name: string) => void
  onNewFolder: (path: string) => void
  onDeleteFile: (path: string) => void
  onDeleteFolder: (path: string) => void
  onRenameFile: (oldPath: string, newPath: string) => void
  onRenameFolder?: (oldPath: string, newPath: string) => void
  onRenameVault: (newName: string) => void
  onDownloadZip: () => void
}

export function FileTree({
  tree,
  selectedPath,
  vaultName,
  onSelect,
  onNewNote,
  onNewFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onRenameFolder,
  onRenameVault,
  onDownloadZip,
}: FileTreeProps) {
  const [creating, setCreating] = useState<'note' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false)
  const [vaultRenaming, setVaultRenaming] = useState(false)

  useEffect(() => {
    if (!vaultMenuOpen) return
    const handler = () => setVaultMenuOpen(false)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [vaultMenuOpen])

  function submitNew() {
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(null); return }
    if (creating === 'note') {
      const name = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
      onNewNote(name)
    } else if (creating === 'folder') {
      onNewFolder(trimmed)
    }
    setNewName('')
    setCreating(null)
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0 gap-1">
        {vaultRenaming ? (
          <input
            autoFocus
            className="flex-1 text-xs font-semibold border border-accent rounded px-1 py-0.5 bg-white dark:bg-gray-900 outline-none uppercase tracking-wide"
            defaultValue={vaultName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim()
                if (v) onRenameVault(v)
                setVaultRenaming(false)
              }
              if (e.key === 'Escape') setVaultRenaming(false)
            }}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v) onRenameVault(v)
              setVaultRenaming(false)
            }}
          />
        ) : (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate flex-1">
            {vaultName}
          </span>
        )}
        <div className="flex items-center gap-0.5 relative shrink-0">
          <button
            onClick={() => { setCreating('folder'); setNewName('') }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-accent text-xs leading-none transition-colors"
            title="New folder"
          >
            📁
          </button>
          <button
            onClick={() => { setCreating('note'); setNewName('') }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-accent font-bold leading-none transition-colors"
            title="New note"
          >
            +
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setVaultMenuOpen(true) }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 text-xs leading-none transition-colors"
            title="Vault options"
          >
            ⋮
          </button>
          {vaultMenuOpen && (
            <div
              className="absolute right-0 top-full mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 min-w-[140px] py-0.5"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => { setVaultRenaming(true); setVaultMenuOpen(false) }}
              >
                ✏ Rename vault
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => { onDownloadZip(); setVaultMenuOpen(false) }}
              >
                ↓ Download as zip
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline new-note/folder input */}
      {creating && (
        <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <input
            autoFocus
            className="w-full text-sm border border-accent rounded-md px-2 py-0.5 bg-white dark:bg-gray-900 outline-none"
            placeholder={creating === 'folder' ? 'Folder name…' : 'Note name…'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              if (e.key === 'Escape') { setCreating(null); setNewName('') }
            }}
            onBlur={submitNew}
          />
        </div>
      )}

      <div className="overflow-y-auto flex-1">
        <FolderNode
          folder={tree}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onNewNote={onNewNote}
          onNewFolder={onNewFolder}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onRenameFile={onRenameFile}
          onRenameFolder={onRenameFolder}
        />
      </div>
    </div>
  )
}

interface FolderNodeProps {
  folder: VaultFolder
  depth: number
  selectedPath: string | null
  onSelect: (file: VaultFile) => void
  onNewNote: (name: string) => void
  onNewFolder: (path: string) => void
  onDeleteFile: (path: string) => void
  onDeleteFolder: (path: string) => void
  onRenameFile: (oldPath: string, newPath: string) => void
  onRenameFolder?: (oldPath: string, newPath: string) => void
}

function FolderNode({
  folder,
  depth,
  selectedPath,
  onSelect,
  onNewNote,
  onNewFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onRenameFolder,
}: FolderNodeProps) {
  const [open, setOpen] = useState(depth < 2)
  const [creating, setCreating] = useState<'note' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const isRoot = depth === 0

  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(false)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  function submitNew() {
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(null); return }
    const prefix = folder.path ? `${folder.path}/` : ''
    if (creating === 'note') {
      const name = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
      onNewNote(`${prefix}${name}`)
    } else if (creating === 'folder') {
      onNewFolder(`${prefix}${trimmed}`)
    }
    setNewName('')
    setCreating(null)
  }

  function submitRename(value: string) {
    const v = value.trim()
    if (v && onRenameFolder) {
      const parentPath = folder.path.includes('/')
        ? folder.path.split('/').slice(0, -1).join('/')
        : ''
      const newPath = parentPath ? `${parentPath}/${v}` : v
      onRenameFolder(folder.path, newPath)
    }
    setRenaming(false)
  }

  const visibleChildren = folder.children.filter((child) => {
    if (!('children' in child) && child.name === '.gitkeep') return false
    return true
  })

  return (
    <div>
      {!isRoot && (
        <div
          className="relative"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {renaming ? (
            <div className="flex items-center py-1 pr-2" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
              <input
                autoFocus
                className="w-full text-sm border border-accent rounded-md px-2 py-0.5 bg-white dark:bg-gray-900 outline-none"
                defaultValue={folder.name}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename((e.target as HTMLInputElement).value)
                  if (e.key === 'Escape') setRenaming(false)
                }}
                onBlur={(e) => submitRename(e.target.value)}
              />
            </div>
          ) : (
            <button
              className="flex items-center gap-1 w-full text-left px-2 py-[5px] hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300 transition-colors"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="text-xs text-gray-400">{open ? '▾' : '▸'}</span>
              <span className={depth === 1 ? 'text-xs font-semibold uppercase tracking-wide truncate' : 'font-medium truncate'}>
                {folder.name}
              </span>
            </button>
          )}
          {!renaming && hovered && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); setCreating('folder'); setNewName(''); setOpen(true) }}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 text-xs leading-none"
                title="New subfolder"
              >
                📁
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setCreating('note'); setNewName(''); setOpen(true) }}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 font-bold text-xs leading-none"
                title="New note here"
              >
                +
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 text-xs leading-none"
                title="Folder options"
              >
                ⋮
              </button>
            </div>
          )}
          {!renaming && menuOpen && (
            <div
              className="absolute right-1 top-full mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 min-w-[120px] py-0.5"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {onRenameFolder && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => { setRenaming(true); setMenuOpen(false) }}
                >
                  ✏ Rename
                </button>
              )}
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm(`Delete folder "${folder.name}" and all its contents?`)) {
                    onDeleteFolder(folder.path)
                  }
                }}
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      )}
      {(isRoot || open) && (
        <div>
          {creating && (
            <div className="py-1" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px`, paddingRight: '8px' }}>
              <input
                autoFocus
                className="w-full text-sm border border-accent rounded-md px-2 py-0.5 bg-white dark:bg-gray-900 outline-none"
                placeholder={creating === 'folder' ? 'Folder name…' : 'Note name…'}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNew()
                  if (e.key === 'Escape') { setCreating(null); setNewName('') }
                }}
                onBlur={submitNew}
              />
            </div>
          )}
          {visibleChildren.map((child) =>
            'children' in child ? (
              <FolderNode
                key={child.path}
                folder={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onNewNote={onNewNote}
                onNewFolder={onNewFolder}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
                onRenameFile={onRenameFile}
                onRenameFolder={onRenameFolder}
              />
            ) : (
              <FileNode
                key={child.path}
                file={child}
                depth={depth + 1}
                selected={selectedPath === child.path}
                onSelect={onSelect}
                onDeleteFile={onDeleteFile}
                onRenameFile={onRenameFile}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

interface FileNodeProps {
  file: VaultFile
  depth: number
  selected: boolean
  onSelect: (file: VaultFile) => void
  onDeleteFile: (path: string) => void
  onRenameFile: (oldPath: string, newPath: string) => void
}

function FileNode({ file, depth, selected, onSelect, onDeleteFile, onRenameFile }: FileNodeProps) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(false)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const parentPath = file.path.includes('/')
    ? file.path.split('/').slice(0, -1).join('/')
    : ''

  function submitRename(value: string) {
    const v = value.trim()
    if (v) {
      const newName = file.type === 'markdown' && !v.endsWith('.md') ? `${v}.md` : v
      const newPath = parentPath ? `${parentPath}/${newName}` : newName
      onRenameFile(file.path, newPath)
    }
    setRenaming(false)
  }

  if (renaming) {
    return (
      <div className="relative px-2 py-1 pr-2" style={{ paddingLeft: `${depth * 12 + 6}px` }}>
        <input
          autoFocus
          className="w-full text-sm border border-accent rounded-md px-2 py-0.5 bg-white dark:bg-gray-900 outline-none"
          defaultValue={displayName(file)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setRenaming(false)
          }}
          onBlur={(e) => submitRename(e.target.value)}
        />
      </div>
    )
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'filetree', path: file.path }))
          e.dataTransfer.effectAllowed = 'copy'
        }}
        className={[
          'flex items-center w-full text-left py-[5px] pr-6 text-gray-800 dark:text-gray-200 truncate transition-colors',
          selected
            ? 'bg-accent/10 dark:bg-accent/15 text-accent font-medium border-l-2 border-accent'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 border-l-2 border-transparent',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        onClick={() => onSelect(file)}
      >
        <span className="truncate">{displayName(file)}</span>
      </button>
      {hovered && (
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 text-xs leading-none"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }}
          title="File options"
        >
          ⋮
        </button>
      )}
      {menuOpen && (
        <div
          className="absolute right-1 top-full mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50 min-w-[120px] py-0.5"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => { setRenaming(true); setMenuOpen(false) }}
          >
            ✏ Rename
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
            onClick={() => {
              setMenuOpen(false)
              if (window.confirm(`Delete "${displayName(file)}"?`)) {
                onDeleteFile(file.path)
              }
            }}
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  )
}

function displayName(file: VaultFile): string {
  if (file.type === 'markdown' && file.name.endsWith('.md')) {
    return file.name.slice(0, -3)
  }
  return file.name
}
