import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Editor, type EditorRef } from '@bazalt/editor'
import { parseNote, type ParsedNote, type FileVersion } from '@bazalt/core'
import { MarkdownPreview } from './MarkdownPreview.js'
import { PaneSplitter } from './PaneSplitter.js'
import { VersionHistoryPanel } from './VersionHistoryPanel.js'

interface NoteEditorProps {
  path: string
  content: string
  initialViewMode?: ViewMode
  onViewModeChange?: (path: string, mode: ViewMode) => void
  onSave: (path: string, content: string) => Promise<void>
  onDraftChange?: (path: string, content: string) => void
  onWikiLinkClick: (target: string) => void
  writeBinaryFile?: (path: string, data: ArrayBuffer) => Promise<void>
  resolveAttachment?: (path: string) => Promise<string>
  refreshVault?: () => Promise<void>
  listVersions?: (path: string) => Promise<FileVersion[]>
  readVersion?: (path: string, id: number) => Promise<string>
  restoreVersion?: (path: string, id: number) => Promise<void>
  onAfterRestore?: (path: string, content: string) => void
}

type ViewMode = 'edit' | 'preview' | 'split'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const fileExt = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

let _attachCounter = 0
function attachmentName(ext: string): string {
  const now = new Date()
  const pad = (n: number, l = 2) => String(n).padStart(l, '0')
  const stamp =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(++_attachCounter, 3)
  return `image${stamp}${ext}`
}

export function NoteEditor({
  path,
  content,
  initialViewMode,
  onViewModeChange,
  onSave,
  onDraftChange,
  onWikiLinkClick,
  writeBinaryFile,
  resolveAttachment,
  refreshVault,
  listVersions,
  readVersion,
  restoreVersion,
  onAfterRestore,
}: NoteEditorProps) {
  const [mode, setMode] = useState<ViewMode>(initialViewMode ?? 'split')
  const [draft, setDraft] = useState(content)
  const [saved, setSaved] = useState(true)
  const [parsed, setParsed] = useState<ParsedNote>(() => parseNote(content))
  const [dragOver, setDragOver] = useState(false)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [showHistory, setShowHistory] = useState(false)
  const [versionPreview, setVersionPreview] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<EditorRef>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Reset when file changes
  useEffect(() => {
    setDraft(content)
    setSaved(true)
    setParsed(parseNote(content))
    setVersionPreview(null)
    setShowHistory(false)
  }, [path, content])

  const changeMode = useCallback((m: ViewMode) => {
    setMode(m)
    onViewModeChange?.(path, m)
  }, [path, onViewModeChange])

  const handleChange = useCallback(
    (value: string) => {
      setDraft(value)
      setSaved(false)
      setParsed(parseNote(value))
      onDraftChange?.(path, value)

      // Auto-save after 800ms of inactivity
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onSave(path, value).then(() => setSaved(true))
      }, 800)
    },
    [path, onSave, onDraftChange],
  )

  const handleManualSave = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await onSave(path, draft)
    setSaved(true)
  }, [path, draft, onSave])

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleManualSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleManualSave])

  const saveAttachment = useCallback(
    async (file: File) => {
      if (!writeBinaryFile) return
      const buffer = await file.arrayBuffer()
      const ext = fileExt(file.name)
      const rawBase = file.name.slice(0, file.name.length - ext.length) || 'file'
      const isGenericName = /^image$/i.test(rawBase)
      const uniqueName = isGenericName ? attachmentName(ext) : file.name
      const destPath = `attachments/${uniqueName}`
      await writeBinaryFile(destPath, buffer)
      const link = IMAGE_EXT.has(ext) ? `![[${uniqueName}]]` : `[[${uniqueName}]]`
      // Insert at the real CM cursor position via ref; no stale-draft issues
      editorRef.current?.insertText(`\n${link}\n`)
      await refreshVault?.()
    },
    [writeBinaryFile, refreshVault],
  )

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      for (const file of files) await saveAttachment(file)
      e.target.value = ''
    },
    [saveAttachment],
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files)
      if (files.length === 0) return
      e.preventDefault()
      for (const file of files) await saveAttachment(file)
    },
    [saveAttachment],
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) await saveAttachment(file)
    },
    [saveAttachment],
  )

  const title = path.split('/').pop()?.replace(/\.md$/, '') ?? path

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0 gap-3">
        <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{title}</h1>
        <div className="flex items-center gap-2">
          {saved ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              Saved
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
              Unsaved
            </span>
          )}
          {listVersions && (
            <button
              onClick={() => { setShowHistory((v) => !v); setVersionPreview(null) }}
              className={[
                'px-2 py-1 text-xs rounded-md transition-colors',
                showHistory
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-accent',
              ].join(' ')}
              title="Version history"
            >
              🕐
            </button>
          )}
          {writeBinaryFile && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400 hover:text-accent transition-colors"
                title="Attach file"
              >
                📎
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
            </>
          )}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs bg-gray-50 dark:bg-gray-800">
            {(['edit', 'split', 'preview'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className={[
                  'px-2 py-1 capitalize',
                  mode === m
                    ? 'bg-accent text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {versionPreview !== null ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 text-sm text-amber-700 dark:text-amber-400 shrink-0">
            <span className="text-xs font-medium">Viewing historical version (read-only)</span>
            <button
              onClick={() => setVersionPreview(null)}
              className="ml-auto text-xs underline hover:opacity-70"
            >
              Exit preview
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <MarkdownPreview
              body={parseNote(versionPreview).body}
              onWikiLinkClick={onWikiLinkClick}
              resolveAttachment={resolveAttachment}
            />
          </div>
        </div>
      ) : (
        <div
          ref={contentRef}
          className={`flex flex-1 min-h-0 relative ${dragOver ? 'ring-2 ring-inset ring-accent ring-opacity-60' : ''}`}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {(mode === 'edit' || mode === 'split') && (
            <div
              className="min-h-0 min-w-0"
              style={{ flex: mode === 'split' ? splitRatio : 1 }}
            >
              <Editor
                ref={editorRef}
                content={draft}
                onChange={handleChange}
                onWikiLinkClick={onWikiLinkClick}
                className="h-full"
              />
            </div>
          )}
          {mode === 'split' && (
            <PaneSplitter
              onDelta={(dx) => {
                const w = contentRef.current?.clientWidth ?? 800
                setSplitRatio((r) => Math.min(0.85, Math.max(0.15, r + dx / w)))
              }}
            />
          )}
          {(mode === 'preview' || mode === 'split') && (
            <div
              className="min-h-0 min-w-0 overflow-y-auto p-6"
              style={{ flex: mode === 'split' ? 1 - splitRatio : 1 }}
            >
              <MarkdownPreview
                body={parsed.body}
                onWikiLinkClick={onWikiLinkClick}
                resolveAttachment={resolveAttachment}
              />
            </div>
          )}

          {/* Version history side panel */}
          {showHistory && listVersions && readVersion && restoreVersion && (
            <div className="absolute right-0 top-0 bottom-0 w-72 z-10 shadow-lg border-l border-gray-200 dark:border-gray-700 flex flex-col">
              <VersionHistoryPanel
                path={path}
                listVersions={listVersions}
                readVersion={readVersion}
                restoreVersion={restoreVersion}
                onClose={() => setShowHistory(false)}
                onViewVersion={(c) => { setVersionPreview(c); setShowHistory(false) }}
                onRestored={(c) => {
                  setDraft(c)
                  setParsed(parseNote(c))
                  setSaved(true)
                  setVersionPreview(null)
                  onAfterRestore?.(path, c)
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
