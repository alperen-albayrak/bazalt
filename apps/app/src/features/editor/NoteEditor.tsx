import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Editor } from '@bazalt/editor'
import { parseNote, type ParsedNote } from '@bazalt/core'
import { MarkdownPreview } from './MarkdownPreview.js'

interface NoteEditorProps {
  path: string
  content: string
  onSave: (path: string, content: string) => Promise<void>
  onWikiLinkClick: (target: string) => void
}

type ViewMode = 'edit' | 'preview' | 'split'

export function NoteEditor({ path, content, onSave, onWikiLinkClick }: NoteEditorProps) {
  const [mode, setMode] = useState<ViewMode>('split')
  const [draft, setDraft] = useState(content)
  const [saved, setSaved] = useState(true)
  const [parsed, setParsed] = useState<ParsedNote>(() => parseNote(content))
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      <div className="flex flex-1 min-h-0">
        {(mode === 'edit' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'w-full'} min-h-0`}>
            <Editor
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
            />
          </div>
        )}
      </div>
    </div>
  )
}
