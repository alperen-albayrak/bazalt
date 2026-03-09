import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

/** Callback invoked when user clicks a wikilink */
export type WikiLinkClickHandler = (target: string) => void

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc.toString()

  const matches: Array<{ from: number; to: number; target: string }> = []
  for (const m of doc.matchAll(WIKILINK_RE)) {
    const raw = m[1]
    const pipe = raw.indexOf('|')
    const target = pipe >= 0 ? raw.slice(0, pipe).trim() : raw.trim()
    matches.push({ from: m.index!, to: m.index! + m[0].length, target })
  }

  // Sort by position (required by RangeSetBuilder)
  matches.sort((a, b) => a.from - b.from)

  for (const { from, to, target } of matches) {
    builder.add(from, to, Decoration.mark({ class: 'bz-wikilink', attributes: { 'data-target': target } }))
  }

  return builder.finish()
}

/** CodeMirror extension that renders [[wikilinks]] as clickable spans. */
export function wikilinksExtension(onClick: WikiLinkClickHandler) {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet

        constructor(view: EditorView) {
          this.decorations = buildDecorations(view)
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = buildDecorations(update.view)
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.domEventHandlers({
      mousedown(event, _view) {
        const el = (event.target as Element).closest('.bz-wikilink')
        if (!el) return false
        const target = el.getAttribute('data-target')
        if (target) {
          event.preventDefault()
          onClick(target)
          return true
        }
        return false
      },
    }),
  ]
}

/** CSS for wikilinks — inject once into the document */
export const wikilinksTheme = EditorView.baseTheme({
  '.bz-wikilink': {
    color: 'var(--bz-link-color, #7c3aed)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--bz-link-color, #7c3aed)',
    '&:hover': {
      opacity: '0.8',
    },
  },
})
