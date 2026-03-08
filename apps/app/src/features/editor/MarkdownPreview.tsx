import React, { useMemo, useEffect, useRef } from 'react'
import { marked } from 'marked'

interface MarkdownPreviewProps {
  body: string
  onWikiLinkClick: (target: string) => void
  resolveAttachment?: (path: string) => Promise<string>
}

const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

function attachmentExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function MarkdownPreview({ body, onWikiLinkClick, resolveAttachment }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    // Handle image wikilinks ![[...]] before regular [[...]]
    const withAttachWikilinks = body.replace(/!\[\[([^\]]+)\]\]/g, (_, name) => {
      const trimmed = name.trim()
      return `<img data-attachment="${encodeURIComponent(trimmed)}" alt="${trimmed}" src="" />`
    })

    // Replace regular [[wikilinks]]
    const withLinks = withAttachWikilinks.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const pipe = inner.indexOf('|')
      const target = pipe >= 0 ? inner.slice(0, pipe).trim() : inner.trim()
      const display = pipe >= 0 ? inner.slice(pipe + 1).trim() : target
      return `<a class="bz-wikilink-render" data-target="${encodeURIComponent(target)}" href="#">${display}</a>`
    })

    // Custom marked renderer for relative image paths
    const renderer = new marked.Renderer()
    renderer.image = ({ href, text }: { href: string; title: string | null; text: string; type?: string; raw?: string }) => {
      if (!href) return `<img src="" alt="${text ?? ''}" />`
      const ext = attachmentExt(href)
      if (IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext)) {
        const encoded = encodeURIComponent(href)
        if (AUDIO_EXT.has(ext)) {
          return `<audio controls data-attachment="${encoded}" src=""></audio>`
        }
        if (VIDEO_EXT.has(ext)) {
          return `<video controls data-attachment="${encoded}" src=""></video>`
        }
        return `<img data-attachment="${encoded}" alt="${text ?? ''}" src="" />`
      }
      return `<img src="${href}" alt="${text ?? ''}" />`
    }

    return marked.parse(withLinks, { renderer }) as string
  }, [body])

  // Second pass: resolve data-attachment elements to blob URLs
  useEffect(() => {
    if (!resolveAttachment || !containerRef.current) return
    const container = containerRef.current
    const elements = container.querySelectorAll('[data-attachment]')
    elements.forEach((el) => {
      const encoded = el.getAttribute('data-attachment') ?? ''
      const path = decodeURIComponent(encoded)
      // Check attachments/ prefix first, then try as-is
      const tryPaths = path.includes('/') ? [path] : [`attachments/${path}`, path]
      async function resolve() {
        for (const p of tryPaths) {
          try {
            const blobUrl = await resolveAttachment!(p)
            if (blobUrl) {
              el.setAttribute('src', blobUrl)
              return
            }
          } catch {
            // try next
          }
        }
      }
      resolve()
    })
  }, [html, resolveAttachment])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-target]') as HTMLElement | null
    if (!el) return
    e.preventDefault()
    const target = decodeURIComponent(el.getAttribute('data-target') ?? '')
    if (target) onWikiLinkClick(target)
  }

  return (
    <div
      ref={containerRef}
      className="bz-markdown prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
      onClick={handleClick}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised markdown output
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
