import type { VaultFile } from './vault.js'
import { extractWikiLinks } from './parser.js'

export interface BacklinkEntry {
  /** Path of the file that contains the link */
  sourcePath: string
  /** The raw wikilink text */
  rawLink: string
}

export interface LinkGraph {
  /** outgoing: filePath → list of resolved target paths */
  outgoing: Map<string, string[]>
  /** incoming (backlinks): filePath → list of sources linking to it */
  incoming: Map<string, BacklinkEntry[]>
}

/**
 * Build the full link graph from file contents.
 * @param files  flat list of vault files
 * @param readContent  function to get file content by path
 */
export async function buildLinkGraph(
  files: VaultFile[],
  readContent: (path: string) => Promise<string>,
): Promise<LinkGraph> {
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, BacklinkEntry[]>()

  const mdFiles = files.filter((f) => f.type === 'markdown' || f.type === 'excalidraw')

  // Init incoming map
  for (const f of mdFiles) incoming.set(f.path, [])

  for (const file of mdFiles) {
    const content = await readContent(file.path)
    const links = extractWikiLinks(content)
    const resolved: string[] = []

    for (const link of links) {
      const target = resolveLink(link.target, file.path, files)
      if (target) {
        resolved.push(target)
        const backlinks = incoming.get(target) ?? []
        backlinks.push({ sourcePath: file.path, rawLink: link.raw })
        incoming.set(target, backlinks)
      }
    }

    outgoing.set(file.path, resolved)
  }

  return { outgoing, incoming }
}

/**
 * Resolve a wikilink target string to a file path within the vault.
 * Obsidian resolution rules (simplified):
 *  1. Exact path match (relative to root)
 *  2. Match by filename (without extension) anywhere in vault
 *  3. Partial path suffix match
 */
export function resolveLink(
  target: string,
  _sourcePath: string,
  files: VaultFile[],
): string | null {
  if (!target) return null

  const normalised = target.replace(/\\/g, '/')

  // 1. Exact match (target includes path separators)
  const exact = files.find(
    (f) => f.path === normalised || f.path === normalised + '.md',
  )
  if (exact) return exact.path

  // 2. Match by base name (strip extension from target if present)
  const targetBase = normalised.includes('.')
    ? normalised.slice(0, normalised.lastIndexOf('.'))
    : normalised

  const byName = files.filter((f) => {
    const fileBase = f.name.includes('.') ? f.name.slice(0, f.name.lastIndexOf('.')) : f.name
    return fileBase === targetBase || fileBase === normalised
  })

  if (byName.length === 1) return byName[0].path

  // 3. If multiple matches, prefer shorter path (closest to root)
  if (byName.length > 1) {
    return byName.sort((a, b) => a.path.length - b.path.length)[0].path
  }

  return null
}

/** Get backlinks for a specific file path. */
export function getBacklinks(graph: LinkGraph, filePath: string): BacklinkEntry[] {
  return graph.incoming.get(filePath) ?? []
}
