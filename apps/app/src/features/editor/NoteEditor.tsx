import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Editor, type EditorRef } from '@bazalt/editor'
import { parseNote, type ParsedNote } from '@bazalt/core'
import { MarkdownPreview } from './MarkdownPreview.js'

interface NoteEditorProps {
  path: string
  content: string
  onSave: (path: string, content: string) => Promise<void>
  onWikiLinkClick: (target: string) => void
  writeBinaryFile?: (path: string, data: ArrayBuffer) => Promise<void>
  resolveAttachment?: (path: string) => Promise<string>
  refreshVault?: () => Promise<void>
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
  onSave,
  onWikiLinkClick,
  writeBinaryFile,
  resolveAttachment,
  refreshVault,
}: NoteEditorProps) {
  const [mode, setMode] = useState<ViewMode>('split')
  const [draft, setDraft] = useState(content)
  const [saved, setSaved] = useState(true)
  const [parsed, setParsed] = useState<ParsedNote>(() => parseNote(content))
  const [dragOver, setDragOver] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<EditorRef>(null)

  // Reset when file changes
  useEffect(() => {
    setDraft(content)
    setSaved(true)
    setParsed(parseNote(content))
  }, [path, content])

  const handleChange = useCallback(
    (value: string) => {
      setDraft(value)
      setSaved(false)
      setParsed(parseNote(value))

      // Auto-save after 800ms of inactivity
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onSave(path, value).then(() => setSaved(true))
      }, 800)
    },
    [path, onSave],
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">{title}</h1>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${saved ? 'text-gray-400' : 'text-amber-500'}`}>
            {saved ? 'Saved' : 'Unsaved'}
          </span>
          {writeBinaryFile && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-400"
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
          <div className="flex rounded border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            {(['edit', 'split', 'preview'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={[
                  'px-2 py-1 capitalize',
                  mode === m
                    ? 'bg-accent text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className={`flex flex-1 min-h-0 ${dragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {(mode === 'edit' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'w-full'} min-h-0`}>
            <Editor
              ref={editorRef}
              content={draft}
              onChange={handleChange}
              onWikiLinkClick={onWikiLinkClick}
              className="h-full"
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} overflow-y-auto p-6`}>
            <MarkdownPreview
              body={parsed.body}
              onWikiLinkClick={onWikiLinkClick}
              resolveAttachment={resolveAttachment}
            />
          </div>
        )}
      </div>
    </div>
  )
}
