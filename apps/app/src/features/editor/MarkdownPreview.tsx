import React, { useMemo } from 'react'
import { marked } from 'marked'
import { extractWikiLinks } from '@bazalt/core'

interface MarkdownPreviewProps {
  body: string
  onWikiLinkClick: (target: string) => void
}

export function MarkdownPreview({ body, onWikiLinkClick }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    // Replace [[wikilinks]] before passing to marked
    const withLinks = body.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const pipe = inner.indexOf('|')
      const target = pipe >= 0 ? inner.slice(0, pipe).trim() : inner.trim()
      const display = pipe >= 0 ? inner.slice(pipe + 1).trim() : target
      return `<a class="bz-wikilink-render" data-target="${encodeURIComponent(target)}" href="#">${display}</a>`
    })
    return marked.parse(withLinks) as string
  }, [body])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-target]') as HTMLElement | null
    if (!el) return
    e.preventDefault()
    const target = decodeURIComponent(el.getAttribute('data-target') ?? '')
    if (target) onWikiLinkClick(target)
  }

  return (
    <div
      className="bz-markdown prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
      onClick={handleClick}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised markdown output
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
