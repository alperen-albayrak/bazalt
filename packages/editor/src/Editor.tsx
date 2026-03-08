import React, { useEffect, useRef, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { wikilinksExtension, wikilinksTheme } from './extensions/wikilinks.js'

export interface EditorProps {
  /** Initial content */
  content: string
  /** Called on every content change */
  onChange?: (value: string) => void
  /** Called when user clicks a [[wikilink]] */
  onWikiLinkClick?: (target: string) => void
  /** Whether the editor is read-only */
  readOnly?: boolean
  className?: string
}

export function Editor({ content, onChange, onWikiLinkClick, readOnly = false, className }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onWikiLinkClickRef = useRef(onWikiLinkClick)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onWikiLinkClickRef.current = onWikiLinkClick }, [onWikiLinkClick])

  const handleWikiLinkClick = useCallback((target: string) => {
    onWikiLinkClickRef.current?.(target)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        highlightActiveLine(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        wikilinksExtension(handleWikiLinkClick),
        wikilinksTheme,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { fontFamily: 'inherit', overflow: 'auto' },
          '.cm-content': { padding: '1rem' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount once

  // Sync external content changes (e.g. switching files)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      })
    }
  }, [content])

  return <div ref={containerRef} className={className} style={{ height: '100%' }} />
}
