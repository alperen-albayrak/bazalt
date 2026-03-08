import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

/** Callback invoked when user clicks a wikilink */
export type WikiLinkClickHandler = (target: string) => void

class WikiLinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly display: string,
    private readonly onClick: WikiLinkClickHandler,
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'bz-wikilink'
    span.textContent = this.display
    span.setAttribute('data-target', this.target)
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.onClick(this.target)
    })
    return span
  }

  eq(other: WikiLinkWidget): boolean {
    return other.target === this.target && other.display === this.display
  }

  ignoreEvent(): boolean {
    return false
  }
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

function buildDecorations(view: EditorView, onClick: WikiLinkClickHandler): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc.toString()

  const matches: Array<{ from: number; to: number; target: string; display: string }> = []
  for (const m of doc.matchAll(WIKILINK_RE)) {
    const raw = m[1]
    const pipe = raw.indexOf('|')
    const target = pipe >= 0 ? raw.slice(0, pipe).trim() : raw.trim()
    const display = pipe >= 0 ? raw.slice(pipe + 1).trim() : target
    matches.push({ from: m.index!, to: m.index! + m[0].length, target, display })
  }

  // Sort by position (required by RangeSetBuilder)
  matches.sort((a, b) => a.from - b.from)

  for (const { from, to, target, display } of matches) {
    builder.add(
      from,
      to,
      Decoration.replace({
        widget: new WikiLinkWidget(target, display, onClick),
      }),
    )
  }

  return builder.finish()
}

/** CodeMirror extension that renders [[wikilinks]] as clickable spans. */
export function wikilinksExtension(onClick: WikiLinkClickHandler) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, onClick)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, onClick)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
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
