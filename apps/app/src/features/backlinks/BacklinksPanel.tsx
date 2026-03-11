import React from 'react'
import type { BacklinkEntry } from '@bazalt/core'

interface BacklinksPanelProps {
  currentPath: string
  backlinks: BacklinkEntry[]
  onNavigate: (path: string) => void
  onClose: () => void
}

export function BacklinksPanel({ currentPath, backlinks, onNavigate, onClose }: BacklinksPanelProps) {
  const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? currentPath

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Backlinks</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs"
          title="Hide backlinks"
        >
          ×
        </button>
      </div>
      {backlinks.length === 0 ? (
        <p className="px-4 py-6 text-center text-gray-400 dark:text-gray-500 text-xs">No notes link here yet.</p>
      ) : (
        <div className="overflow-y-auto flex-1">
          {backlinks.map((bl, i) => {
            const sourceName = bl.sourcePath.split('/').pop()?.replace(/\.md$/, '') ?? bl.sourcePath
            return (
              <button
                key={i}
                onClick={() => onNavigate(bl.sourcePath)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
              >
                <div className="font-medium text-accent truncate">{sourceName}</div>
                <div className="text-gray-400 dark:text-gray-500 text-xs font-mono truncate mt-0.5">[[{bl.rawLink}]]</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
