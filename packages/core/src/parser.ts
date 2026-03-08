export interface Frontmatter {
  [key: string]: unknown
}

export interface ParsedNote {
  /** Raw YAML frontmatter string (without --- delimiters) */
  frontmatterRaw: string | null
  /** Parsed frontmatter key-value pairs */
  frontmatter: Frontmatter
  /** Markdown body without frontmatter */
  body: string
  /** All [[wikilink]] targets found in body */
  wikilinks: WikiLink[]
  /** All #tags found in body */
  tags: string[]
}

export interface WikiLink {
  /** Raw link text e.g. "Note Title" or "folder/Note|alias" */
  raw: string
  /** Target file name or path (before |) */
  target: string
  /** Optional display alias (after |) */
  alias: string | null
  /** Optional block ref (after ^) */
  blockRef: string | null
  /** Optional heading ref (after #) */
  headingRef: string | null
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export function parseNote(content: string): ParsedNote {
  let body = content
  let frontmatterRaw: string | null = null
  const frontmatter: Frontmatter = {}

  const fm = content.match(FRONTMATTER_RE)
  if (fm) {
    frontmatterRaw = fm[1]
    body = content.slice(fm[0].length)
    Object.assign(frontmatter, parseYamlSimple(fm[1]))
  }

  const wikilinks = extractWikiLinks(body)
  const tags = extractTags(body, frontmatter)

  return { frontmatterRaw, frontmatter, body, wikilinks, tags }
}

/** Minimal YAML parser — handles flat key: value and key: [list] only.
 *  For Phase 1 this is sufficient; Phase 2+ can swap in a real YAML lib. */
function parseYamlSimple(yaml: string): Frontmatter {
  const result: Frontmatter = {}
  const lines = yaml.split(/\r?\n/)
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    const rawVal = line.slice(colon + 1).trim()
    if (!key) continue

    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      result[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      const str = rawVal.replace(/^["']|["']$/g, '')
      if (str === 'true') result[key] = true
      else if (str === 'false') result[key] = false
      else if (str !== '' && !isNaN(Number(str))) result[key] = Number(str)
      else result[key] = str
    }
  }
  return result
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

export function extractWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const m of text.matchAll(WIKILINK_RE)) {
    links.push(parseWikiLink(m[1]))
  }
  return links
}

export function parseWikiLink(raw: string): WikiLink {
  let rest = raw
  let alias: string | null = null
  let blockRef: string | null = null
  let headingRef: string | null = null

  const pipeIdx = rest.indexOf('|')
  if (pipeIdx >= 0) {
    alias = rest.slice(pipeIdx + 1).trim()
    rest = rest.slice(0, pipeIdx)
  }

  const caretIdx = rest.indexOf('^')
  if (caretIdx >= 0) {
    blockRef = rest.slice(caretIdx + 1).trim()
    rest = rest.slice(0, caretIdx)
  }

  const hashIdx = rest.indexOf('#')
  if (hashIdx >= 0) {
    headingRef = rest.slice(hashIdx + 1).trim()
    rest = rest.slice(0, hashIdx)
  }

  return { raw, target: rest.trim(), alias, blockRef, headingRef }
}

const INLINE_TAG_RE = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9/_-]*)/g

function extractTags(body: string, frontmatter: Frontmatter): string[] {
  const tags = new Set<string>()

  // frontmatter tags: field
  const fmTags = frontmatter['tags']
  if (Array.isArray(fmTags)) fmTags.forEach((t) => tags.add(String(t)))
  else if (typeof fmTags === 'string') tags.add(fmTags)

  // inline #tags
  for (const m of body.matchAll(INLINE_TAG_RE)) {
    tags.add(m[1])
  }

  return [...tags]
}
