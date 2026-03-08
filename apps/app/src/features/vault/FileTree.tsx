import React, { useState } from 'react'
import type { VaultFile, VaultFolder } from '@bazalt/core'

interface FileTreeProps {
  tree: VaultFolder
  selectedPath: string | null
  onSelect: (file: VaultFile) => void
  onNewNote: (name: string) => void
}

export function FileTree({ tree, selectedPath, onSelect, onNewNote }: FileTreeProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  function submitNew() {
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(false); return }
    const name = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
    onNewNote(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</span>
        <button
          onClick={() => { setCreating(true); setNewName('') }}
          className="text-gray-400 hover:text-accent transition-colors"
          title="New note"
        >
          +
        </button>
      </div>

      {/* Inline new-note input */}
      {creating && (
        <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <input
            autoFocus
            className="w-full text-sm border border-accent rounded px-2 py-0.5 bg-white dark:bg-gray-900 outline-none"
            placeholder="Note name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            onBlur={submitNew}
          />
        </div>
      )}

      <div className="overflow-y-auto flex-1">
        <FolderNode folder={tree} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      </div>
    </div>
  )
}

interface FolderNodeProps {
  folder: VaultFolder
  depth: number
  selectedPath: string | null
  onSelect: (file: VaultFile) => void
}

function FolderNode({ folder, depth, selectedPath, onSelect }: FolderNodeProps) {
  const [open, setOpen] = useState(depth < 2)

  const isRoot = depth === 0

  return (
    <div>
      {!isRoot && (
        <button
          className="flex items-center gap-1 w-full text-left px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-xs">{open ? '▾' : '▸'}</span>
          <span className="font-medium truncate">{folder.name}</span>
        </button>
      )}
      {(isRoot || open) && (
        <div>
          {folder.children.map((child) =>
            'children' in child ? (
              <FolderNode
                key={child.path}
                folder={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ) : (
              <FileNode
                key={child.path}
                file={child}
                depth={depth + 1}
                selected={selectedPath === child.path}
                onSelect={onSelect}
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
}

function FileNode({ file, depth, selected, onSelect }: FileNodeProps) {
  const icon = fileIcon(file)
  return (
    <button
      className={[
        'flex items-center gap-1.5 w-full text-left py-0.5 text-gray-800 dark:text-gray-200 truncate',
        'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
        selected ? 'bg-accent/10 text-accent font-medium' : '',
      ].join(' ')}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onSelect(file)}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{displayName(file)}</span>
    </button>
  )
}

function fileIcon(file: VaultFile): string {
  switch (file.type) {
    case 'excalidraw': return '✏️'
    case 'canvas': return '🗂️'
    case 'markdown': return '📄'
    default: return '📎'
  }
}

function displayName(file: VaultFile): string {
  if (file.type === 'markdown' && file.name.endsWith('.md')) {
    return file.name.slice(0, -3)
  }
  return file.name
}
