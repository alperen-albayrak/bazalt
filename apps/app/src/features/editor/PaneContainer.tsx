import React, { useRef, useState } from 'react'
import type { Pane, Tab } from '../../App.js'
import type { FileVersion } from '@bazalt/core'
import { TabBar } from './TabBar.js'
import { NoteEditor } from './NoteEditor.js'
import { AttachmentViewer } from './AttachmentViewer.js'

type ViewMode = 'edit' | 'split' | 'preview'

interface PaneContainerProps {
  pane: Pane
  flex: number
  isActive: boolean
  tabContents: React.MutableRefObject<Map<string, string>>
  onActivate: () => void
  onTabSelect: (path: string) => void
  onTabClose: (path: string) => void
  onTabDrop: (path: string, fromPaneId: string) => void
  onSplit: () => void
  onSplitWith: (path: string, direction: 'left' | 'right') => void
  onSave: (path: string, content: string) => Promise<void>
  onDraftChange: (path: string, content: string) => void
  onViewModeChange: (path: string, mode: ViewMode) => void
  onWikiLinkClick: (target: string) => Promise<void>
  writeBinaryFile: (path: string, data: ArrayBuffer) => Promise<void>
  resolveAttachment: (path: string) => Promise<string>
  refreshVault: () => Promise<void>
  listVersions?: (path: string) => Promise<FileVersion[]>
  readVersion?: (path: string, id: number) => Promise<string>
  restoreVersion?: (path: string, id: number) => Promise<void>
  onAfterRestore?: (path: string, content: string) => void
}

type DragZone = 'split-left' | 'split-right' | 'open' | null

export function PaneContainer({
  pane,
  flex,
  isActive,
  tabContents,
  onActivate,
  onTabSelect,
  onTabClose,
  onTabDrop,
  onSplit,
  onSplitWith,
  onSave,
  onDraftChange,
  onViewModeChange,
  onWikiLinkClick,
  writeBinaryFile,
  resolveAttachment,
  refreshVault,
  listVersions,
  readVersion,
  restoreVersion,
  onAfterRestore,
}: PaneContainerProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [dragZone, setDragZone] = useState<DragZone>(null)

  const isFiletreeDrag = (e: React.DragEvent) => {
    // Can't reliably read data during dragover, so accept all drags and filter on drop
    return e.dataTransfer.types.includes('text/plain')
  }

  const getZone = (e: React.DragEvent): DragZone => {
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect) return 'open'
    const x = e.clientX - rect.left
    if (x < rect.width / 3) return 'split-left'
    if (x > (rect.width * 2) / 3) return 'split-right'
    return 'open'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFiletreeDrag(e)) return
    e.preventDefault()
    setDragZone(getZone(e))
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the body entirely
    if (!bodyRef.current?.contains(e.relatedTarget as Node)) {
      setDragZone(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const zone = dragZone
    setDragZone(null)
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (data.source === 'filetree') {
        if (zone === 'split-left') {
          onSplitWith(data.path, 'left')
        } else if (zone === 'split-right') {
          onSplitWith(data.path, 'right')
        } else {
          onTabSelect(data.path)
        }
      }
    } catch { /* ignore */ }
  }

  const activeTab: Tab | undefined = pane.tabs.find((t) => t.path === pane.activeTabPath)

  return (
    <div
      className={`min-w-0 min-h-0 flex flex-col ${isActive ? 'ring-1 ring-inset ring-accent/30' : ''}`}
      style={{ flex }}
      onClick={onActivate}
    >
      <TabBar
        paneId={pane.id}
        tabs={pane.tabs}
        activeTabPath={pane.activeTabPath}
        onSelect={onTabSelect}
        onClose={onTabClose}
        onDrop={onTabDrop}
        onOpenFile={onTabSelect}
        onSplit={onSplit}
      />
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 flex flex-col relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {pane.activeTabPath && activeTab ? (
          activeTab.fileType !== 'note' ? (
            <AttachmentViewer
              key={pane.activeTabPath}
              path={pane.activeTabPath}
              fileType={activeTab.fileType}
              resolveAttachment={resolveAttachment}
            />
          ) : (
            <NoteEditor
              key={pane.activeTabPath}
              path={pane.activeTabPath}
              content={tabContents.current.get(pane.activeTabPath) ?? ''}
              initialViewMode={activeTab.viewMode}
              onViewModeChange={onViewModeChange}
              onSave={onSave}
              onDraftChange={onDraftChange}
              onWikiLinkClick={onWikiLinkClick}
              writeBinaryFile={writeBinaryFile}
              resolveAttachment={resolveAttachment}
              refreshVault={refreshVault}
              listVersions={listVersions}
              readVersion={readVersion}
              restoreVersion={restoreVersion}
              onAfterRestore={onAfterRestore}
            />
          )
        ) : (
          <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
            Select a note to start editing
          </div>
        )}

        {/* Drag-over overlay */}
        {dragZone === 'split-left' && (
          <div className="absolute inset-0 pointer-events-none flex">
            <div className="w-1/3 bg-accent/20 border-2 border-accent/60 border-dashed flex items-center justify-center">
              <span className="text-accent text-xs font-medium bg-white/80 dark:bg-gray-900/80 px-2 py-1 rounded">
                ⧉ Split left
              </span>
            </div>
            <div className="flex-1 bg-black/5 dark:bg-white/5" />
          </div>
        )}
        {dragZone === 'split-right' && (
          <div className="absolute inset-0 pointer-events-none flex">
            <div className="flex-1 bg-black/5 dark:bg-white/5" />
            <div className="w-1/3 bg-accent/20 border-2 border-accent/60 border-dashed flex items-center justify-center">
              <span className="text-accent text-xs font-medium bg-white/80 dark:bg-gray-900/80 px-2 py-1 rounded">
                ⧉ Split right
              </span>
            </div>
          </div>
        )}
        {dragZone === 'open' && (
          <div className="absolute inset-0 pointer-events-none border-2 border-accent/40 border-dashed bg-accent/5" />
        )}
      </div>
    </div>
  )
}
