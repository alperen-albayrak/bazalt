import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
} from 'd3-force'
import { parseNote, type VaultFile, type LinkGraph } from '@bazalt/core'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  files: VaultFile[]
  linkGraph: LinkGraph
  selectedPath: string | null
  onNavigate: (path: string) => void
  readFile: (path: string) => Promise<string>
}

interface GraphNode extends SimulationNodeDatum {
  id: string
  name: string
  mtime: number
  backlinkCount: number
  linkCount: number
  tags: string[]
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

// UI values are 0–1 (or a plain number for linkDistance).
// Internally each maps to a clamped physical range — never reaches zero.
interface Forces {
  centerStrength: number  // 0–1 → gravity 0.008..0.15
  repelStrength:  number  // 0–1 → many-body −10..−400
  linkStrength:   number  // 0–1 → link strength 0.05..0.8
  linkDistance:   number  // 20–400 (shown as integer)
  collide:        number  // 0–1 → extra radius 0..30 px
}

interface Display {
  nodeSize:      number   // 0.3–3× multiplier
  showLabels:    boolean
  labelFadeZoom: number   // labels hidden below this zoom (0 = always)
  showArrows:    boolean
  showOrphans:   boolean
}

type FilterAction = 'hide' | 'color'

interface FilterRule {
  id: string
  enabled: boolean
  type: 'name' | 'tag' | 'date'
  pattern: string
  startDate: string
  endDate: string
  action: FilterAction
  color: string
}

// ── Force mapping helpers ─────────────────────────────────────────────────────
// UI slider value [0,1] → physical value, with a safe non-zero minimum.

function toGravity(v: number)   { return 0.008 + v * 0.142 }   // 0.008..0.15
function toRepel(v: number)     { return -(10 + v * 390) }      // −10..−400
function toLinkStr(v: number)   { return 0.05 + v * 0.75 }      // 0.05..0.8
function toCollide(v: number)   { return v * 30 }                // 0..30

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_FORCES: Forces = {
  centerStrength: 0.25,
  repelStrength:  0.35,
  linkStrength:   0.45,
  linkDistance:   80,
  collide:        0.4,
}

const DEFAULT_DISPLAY: Display = {
  nodeSize:      1,
  showLabels:    true,
  labelFadeZoom: 0.35,
  showArrows:    false,
  showOrphans:   true,
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function makeRule(type: FilterRule['type'] = 'name'): FilterRule {
  return { id: Math.random().toString(36).slice(2), enabled: true, type, pattern: '', startDate: '', endDate: '', action: 'color', color: '#f97316' }
}

function anchored(pattern: string): RegExp | null {
  try { return new RegExp(`^(?:${pattern})$`, 'i') } catch { return null }
}

function matchesRule(node: GraphNode, rule: FilterRule): boolean {
  if (rule.type === 'name') {
    if (!rule.pattern) return false
    const re = anchored(rule.pattern)
    return !!re && (re.test(node.name) || re.test(node.id))
  }
  if (rule.type === 'tag') {
    if (!rule.pattern) return false
    const re = anchored(rule.pattern)
    return !!re && node.tags.some((t) => re.test(t))
  }
  if (rule.type === 'date') {
    if (!rule.startDate && !rule.endDate) return false
    if (rule.startDate && node.mtime < new Date(rule.startDate).getTime()) return false
    if (rule.endDate && node.mtime > new Date(rule.endDate).getTime() + 86_400_000) return false
    return true
  }
  return false
}

function evalRules(node: GraphNode, rules: FilterRule[]): { hidden: boolean; color: string | null } {
  let color: string | null = null
  for (const rule of rules) {
    if (!rule.enabled || !matchesRule(node, rule)) continue
    if (rule.action === 'hide') return { hidden: true, color: null }
    color = rule.color
  }
  return { hidden: false, color }
}

function getPos(n: string | GraphNode) {
  return typeof n === 'string' ? { x: 0, y: 0 } : { x: n.x ?? 0, y: n.y ?? 0 }
}
function nodeId(n: string | GraphNode) {
  return typeof n === 'string' ? n : n.id
}
function nodeRadius(node: GraphNode, display: Display) {
  return Math.min(24, Math.max(4, (4 + node.backlinkCount * 1.5) * display.nodeSize))
}

// ── GraphView ─────────────────────────────────────────────────────────────────

export function GraphView({ files, linkGraph, selectedPath, onNavigate, readFile }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const simRef  = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])

  // live-updatable force refs
  const lfRef  = useRef<ReturnType<typeof forceLink<GraphNode, GraphLink>> | null>(null)
  const cfRef  = useRef<ReturnType<typeof forceManyBody<GraphNode>> | null>(null)
  const fxRef  = useRef<ReturnType<typeof forceX<GraphNode>> | null>(null)
  const fyRef  = useRef<ReturnType<typeof forceY<GraphNode>> | null>(null)
  const colRef = useRef<ReturnType<typeof forceCollide<GraphNode>> | null>(null)

  const [tick, setTick]           = useState(0)
  const [tagsLoaded, setTagsLoaded] = useState(0)

  const panRef = useRef({ x: 0, y: 0, scale: 1 })
  const [pan, setPan]             = useState({ x: 0, y: 0, scale: 1 })

  const nodeDragRef      = useRef<{ nodeId: string } | null>(null)
  const nodeDragMoved    = useRef(false)
  const panDragRef       = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [rules,  setRules]        = useState<FilterRule[]>([])
  const [forces, setForces]       = useState<Forces>(DEFAULT_FORCES)
  const [display, setDisplay]     = useState<Display>(DEFAULT_DISPLAY)

  // ── Build simulation ──────────────────────────────────────────────────────

  useEffect(() => {
    simRef.current?.stop()

    const mdFiles = files.filter((f) => f.type === 'markdown')
    const pathSet = new Set(mdFiles.map((f) => f.path))
    const prev    = new Map(nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y, tags: n.tags }]))

    // degree (undirected) for orphan detection
    const degree = new Map<string, number>()
    for (const [src, targets] of linkGraph.outgoing.entries()) {
      for (const tgt of targets) {
        if (!pathSet.has(src) || !pathSet.has(tgt)) continue
        degree.set(src, (degree.get(src) ?? 0) + 1)
        degree.set(tgt, (degree.get(tgt) ?? 0) + 1)
      }
    }

    const simNodes: GraphNode[] = mdFiles.map((f) => {
      const p = prev.get(f.path)
      return {
        id: f.path,
        name: f.name.endsWith('.md') ? f.name.slice(0, -3) : f.name,
        mtime: f.mtime,
        backlinkCount: (linkGraph.incoming.get(f.path) ?? []).length,
        linkCount: degree.get(f.path) ?? 0,
        tags: p?.tags ?? [],
        x: p?.x, y: p?.y,
      }
    })

    const simLinks: GraphLink[] = []
    for (const [src, targets] of linkGraph.outgoing.entries()) {
      if (!pathSet.has(src)) continue
      for (const tgt of targets) {
        if (pathSet.has(tgt)) simLinks.push({ source: src, target: tgt })
      }
    }

    nodesRef.current = simNodes
    linksRef.current = simLinks

    // Use forceX + forceY for gravity instead of forceCenter.
    // forceCenter only shifts the barycenter — it doesn't attract individual nodes.
    // forceX/Y pull EACH node toward (0,0) with the given strength, so orphans
    // stay on screen and the "center force" slider is actually felt.
    const lf  = forceLink<GraphNode, GraphLink>(simLinks).id((d) => d.id)
                  .strength(toLinkStr(forces.linkStrength)).distance(forces.linkDistance)
    const cf  = forceManyBody<GraphNode>().strength(toRepel(forces.repelStrength))
    const fx  = forceX<GraphNode>(0).strength(toGravity(forces.centerStrength))
    const fy  = forceY<GraphNode>(0).strength(toGravity(forces.centerStrength))
    const col = forceCollide<GraphNode>().radius((d) => nodeRadius(d, display) + toCollide(forces.collide))

    lfRef.current = lf; cfRef.current = cf
    fxRef.current = fx; fyRef.current = fy; colRef.current = col

    const sim = forceSimulation<GraphNode>(simNodes)
      .force('link',    lf)
      .force('charge',  cf)
      .force('x',       fx)
      .force('y',       fy)
      .force('collide', col)
      .alphaDecay(0.02)
      .velocityDecay(0.4)

    sim.on('tick', () => setTick((t) => t + 1))
    simRef.current = sim
    setTick((t) => t + 1)
    return () => { sim.stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, linkGraph])

  // ── Live force updates ────────────────────────────────────────────────────

  const applyForces = useCallback((f: Forces, d: Display) => {
    lfRef.current?.strength(toLinkStr(f.linkStrength)).distance(f.linkDistance)
    cfRef.current?.strength(toRepel(f.repelStrength))
    fxRef.current?.strength(toGravity(f.centerStrength))
    fyRef.current?.strength(toGravity(f.centerStrength))
    colRef.current?.radius((n) => nodeRadius(n as GraphNode, d) + toCollide(f.collide))
    simRef.current?.alpha(0.4).restart()
  }, [])

  const patchForces = useCallback((patch: Partial<Forces>) => {
    setForces((prev) => { const next = { ...prev, ...patch }; applyForces(next, display); return next })
  }, [applyForces, display])

  const patchDisplay = useCallback((patch: Partial<Display>) => {
    setDisplay((prev) => {
      const next = { ...prev, ...patch }
      if ('nodeSize' in patch || 'collide' in patch) {
        colRef.current?.radius((n) => nodeRadius(n as GraphNode, next) + toCollide(forces.collide))
        simRef.current?.alpha(0.3).restart()
      }
      return next
    })
  }, [forces.collide])

  // ── Load tags ─────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all(
      files.filter((f) => f.type === 'markdown').map(async (f) => {
        try { return { path: f.path, tags: parseNote(await readFile(f.path)).tags } }
        catch { return { path: f.path, tags: [] } }
      })
    ).then((results) => {
      const m = new Map(results.map((r) => [r.path, r.tags]))
      for (const n of nodesRef.current) n.tags = m.get(n.id) ?? []
      setTagsLoaded((t) => t + 1)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length])

  // ── Coordinate helpers ────────────────────────────────────────────────────

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    const p = panRef.current
    return {
      x: (sx - r.left  - svg.clientWidth  / 2 - p.x) / p.scale,
      y: (sy - r.top   - svg.clientHeight / 2 - p.y) / p.scale,
    }
  }, [])

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    panRef.current = { ...panRef.current, scale: Math.min(4, Math.max(0.05, panRef.current.scale * (1 - e.deltaY * 0.001))) }
    setPan({ ...panRef.current })
  }, [])

  const onSvgDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const tag = (e.target as SVGElement).tagName
    if (tag === 'svg' || tag === 'rect') {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
    }
  }, [])

  const onNodeDown = useCallback((e: React.MouseEvent, nid: string) => {
    e.stopPropagation()
    const node = nodesRef.current.find((n) => n.id === nid)
    if (!node) return
    nodeDragRef.current = { nodeId: nid }
    nodeDragMoved.current = false
    node.fx = node.x; node.fy = node.y
    simRef.current?.alphaTarget(0.3).restart()
  }, [])

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (nodeDragRef.current) {
      nodeDragMoved.current = true
      const { x, y } = screenToWorld(e.clientX, e.clientY)
      const node = nodesRef.current.find((n) => n.id === nodeDragRef.current!.nodeId)
      if (node) { node.fx = x; node.fy = y }
      setTick((t) => t + 1)
    } else if (panDragRef.current) {
      panRef.current = { ...panRef.current, x: panDragRef.current.panX + e.clientX - panDragRef.current.startX, y: panDragRef.current.panY + e.clientY - panDragRef.current.startY }
      setPan({ ...panRef.current })
    }
  }, [screenToWorld])

  const onUp = useCallback(() => {
    if (nodeDragRef.current) {
      const node = nodesRef.current.find((n) => n.id === nodeDragRef.current!.nodeId)
      if (node) { node.fx = null; node.fy = null }
      simRef.current?.alphaTarget(0)
      nodeDragRef.current = null
    }
    panDragRef.current = null
  }, [])

  // ── Derived render data ───────────────────────────────────────────────────

  const nodeEffects = useMemo(() => {
    const m = new Map<string, { hidden: boolean; color: string | null }>()
    for (const n of nodesRef.current) m.set(n.id, evalRules(n, rules))
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, tick, tagsLoaded])

  const visibleIds = useMemo(() => new Set(
    nodesRef.current
      .filter((n) => {
        if (!display.showOrphans && n.linkCount === 0) return false
        return !nodeEffects.get(n.id)?.hidden
      })
      .map((n) => n.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [nodeEffects, display.showOrphans, tick])

  const nodes   = nodesRef.current
  const links   = linksRef.current
  const svgEl   = svgRef.current
  const ox      = (svgEl?.clientWidth  ?? 800) / 2 + pan.x
  const oy      = (svgEl?.clientHeight ?? 600) / 2 + pan.y
  const showLbl = display.showLabels && pan.scale >= display.labelFadeZoom
  const activeRules = rules.filter((r) => r.enabled).length

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 relative bg-gray-50 dark:bg-gray-950">
        <span className="absolute top-3 left-3 z-10 text-xs text-gray-400 dark:text-gray-500 select-none pointer-events-none">
          {nodes.length} notes · {links.length} links · {Math.round(pan.scale * 100)}%
        </span>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className={`absolute top-3 right-3 z-10 text-xs px-2.5 py-1 rounded border transition-colors ${
            panelOpen || activeRules > 0
              ? 'bg-accent text-white border-accent'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-accent'
          }`}
        >
          Settings{activeRules > 0 ? ` · ${activeRules} filter${activeRules > 1 ? 's' : ''}` : ''}
        </button>

        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ cursor: nodeDragRef.current ? 'grabbing' : 'grab' }}
          onWheel={onWheel}
          onMouseDown={onSvgDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        >
          <defs>
            {display.showArrows && (
              <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" fillOpacity={0.5} />
              </marker>
            )}
          </defs>
          <rect width="100%" height="100%" fill="transparent" />
          <g transform={`translate(${ox},${oy}) scale(${pan.scale})`}>
            {links.map((lnk, i) => {
              const sid = nodeId(lnk.source); const tid = nodeId(lnk.target)
              if (!visibleIds.has(sid) || !visibleIds.has(tid)) return null
              const s = getPos(lnk.source); const t = getPos(lnk.target)
              return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#94a3b8" strokeOpacity={0.3} strokeWidth={1 / pan.scale} markerEnd={display.showArrows ? 'url(#arr)' : undefined} />
            })}
            {nodes.map((node) => {
              if (!visibleIds.has(node.id)) return null
              const fx = nodeEffects.get(node.id)
              const r  = nodeRadius(node, display)
              const isSel = node.id === selectedPath
              const isHov = node.id === hoveredId
              const fill  = isSel ? 'var(--color-accent,#6366f1)' : fx?.color ?? (isHov ? '#94a3b8' : '#cbd5e1')
              return (
                <g key={node.id} transform={`translate(${node.x ?? 0},${node.y ?? 0})`} style={{ cursor: 'grab' }}
                  onMouseDown={(e) => onNodeDown(e, node.id)}
                  onClick={() => { if (!nodeDragMoved.current) onNavigate(node.id) }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <circle r={r} fill={fill} />
                  {isSel && <circle r={r + 3} fill="none" stroke="var(--color-accent,#6366f1)" strokeWidth={1.5} strokeOpacity={0.35} />}
                  {showLbl && (
                    <text y={r + 10} textAnchor="middle" fontSize={Math.max(8, 10 / pan.scale)} fill={isHov ? '#475569' : '#94a3b8'} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {node.name.length > 24 ? `${node.name.slice(0, 22)}…` : node.name}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {panelOpen && (
        <SidePanel
          forces={forces} display={display} rules={rules}
          onForces={patchForces} onDisplay={patchDisplay} onRules={setRules}
          onReset={() => { patchForces(DEFAULT_FORCES); patchDisplay(DEFAULT_DISPLAY) }}
        />
      )}
    </div>
  )
}

// ── Side panel ────────────────────────────────────────────────────────────────

function SidePanel({ forces, display, rules, onForces, onDisplay, onRules, onReset }: {
  forces: Forces; display: Display; rules: FilterRule[]
  onForces: (p: Partial<Forces>) => void
  onDisplay: (p: Partial<Display>) => void
  onRules: (r: FilterRule[]) => void
  onReset: () => void
}) {
  const [section, setSection] = useState<'forces' | 'display' | 'filters'>('forces')
  const tog = (s: typeof section) => setSection((p) => p === s ? 'forces' : s)
  const activeRules = rules.filter((r) => r.enabled).length

  return (
    <div className="w-72 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col overflow-hidden text-xs">

      <Section label="Forces" open={section === 'forces'} onToggle={() => tog('forces')}>
        <SliderRow label="Center force"  hint="gravity toward center"  value={forces.centerStrength} min={0} max={1} step={0.01} format={(v) => (toGravity(v) * 100).toFixed(1)} onChange={(v) => onForces({ centerStrength: v })} />
        <SliderRow label="Repel force"   hint="node repulsion"         value={forces.repelStrength}  min={0} max={1} step={0.01} format={(v) => String(Math.round(-toRepel(v)))} onChange={(v) => onForces({ repelStrength: v })} />
        <SliderRow label="Link force"    hint="edge spring strength"   value={forces.linkStrength}   min={0} max={1} step={0.01} format={(v) => toLinkStr(v).toFixed(2)} onChange={(v) => onForces({ linkStrength: v })} />
        <SliderRow label="Link distance" hint="edge rest length (px)"  value={forces.linkDistance}   min={20} max={400} step={1} format={(v) => String(Math.round(v))} onChange={(v) => onForces({ linkDistance: v })} />
        <SliderRow label="Collision"     hint="prevent overlap"        value={forces.collide}        min={0} max={1} step={0.01} format={(v) => Math.round(toCollide(v)) + ' px'} onChange={(v) => onForces({ collide: v })} />
        <button onClick={onReset} className="mt-0.5 w-full text-center text-gray-400 hover:text-accent transition-colors py-0.5">
          Reset defaults
        </button>
      </Section>

      <Section label="Display" open={section === 'display'} onToggle={() => tog('display')}>
        <SliderRow label="Node size"      value={display.nodeSize}      min={0.3} max={3}  step={0.05} format={(v) => v.toFixed(1) + '×'} onChange={(v) => onDisplay({ nodeSize: v })} />
        <SliderRow label="Label fade zoom" hint="hide labels below this zoom" value={display.labelFadeZoom} min={0} max={2} step={0.05} format={(v) => v.toFixed(2) + '×'} onChange={(v) => onDisplay({ labelFadeZoom: v })} />
        <ToggleRow label="Show labels"  value={display.showLabels}  onChange={(v) => onDisplay({ showLabels: v })} />
        <ToggleRow label="Show arrows"  value={display.showArrows}  onChange={(v) => onDisplay({ showArrows: v })} />
        <ToggleRow label="Show orphans" hint="nodes with no links" value={display.showOrphans} onChange={(v) => onDisplay({ showOrphans: v })} />
      </Section>

      <Section
        label={`Filters${activeRules > 0 ? ` (${activeRules})` : ''}`}
        open={section === 'filters'}
        onToggle={() => tog('filters')}
        action={<button onClick={() => onRules([...rules, makeRule()])} className="text-accent hover:text-accent/80 font-medium">+ Add</button>}
      >
        {rules.length === 0
          ? <p className="text-gray-400 dark:text-gray-500 text-center py-4 leading-relaxed">No rules yet.<br />Color or hide nodes by name, tag, or date.</p>
          : <div className="flex flex-col gap-2">
              {rules.map((r) => (
                <RuleRow key={r.id} rule={r}
                  onUpdate={(p) => onRules(rules.map((x) => x.id === r.id ? { ...x, ...p } : x))}
                  onRemove={() => onRules(rules.filter((x) => x.id !== r.id))}
                />
              ))}
            </div>
        }
      </Section>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, open, onToggle, action, children }: {
  label: string; open: boolean; onToggle: () => void; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <button className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors" onClick={onToggle}>
        <span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide" style={{ fontSize: 10 }}>{label}</span>
        <div className="flex items-center gap-2">
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5">{children}</div>}
    </div>
  )
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({ label, hint, value, min, max, step, format, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number
  format: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-gray-600 dark:text-gray-300 shrink-0">{label}</span>
        {hint && <span className="text-gray-400 dark:text-gray-600 truncate" style={{ fontSize: 9 }}>{hint}</span>}
        <span className="text-gray-400 dark:text-gray-500 tabular-nums shrink-0 ml-auto" style={{ fontSize: 10 }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent h-1" />
    </div>
  )
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-2">
      <span className="text-gray-600 dark:text-gray-300">
        {label}
        {hint && <span className="text-gray-400 dark:text-gray-600 ml-1" style={{ fontSize: 9 }}>({hint})</span>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
    </label>
  )
}

// ── Filter rule row ───────────────────────────────────────────────────────────

function RuleRow({ rule, onUpdate, onRemove }: { rule: FilterRule; onUpdate: (p: Partial<FilterRule>) => void; onRemove: () => void }) {
  const inp = 'w-full border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none focus:border-accent'
  const lbl = 'text-gray-400 dark:text-gray-500 w-8 shrink-0'
  return (
    <div className={`rounded-lg border p-2 flex flex-col gap-1.5 ${rule.enabled ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-40'}`}>
      <div className="flex items-center gap-1">
        <input type="checkbox" checked={rule.enabled} onChange={(e) => onUpdate({ enabled: e.target.checked })} className="accent-accent shrink-0" />
        <select value={rule.type} onChange={(e) => onUpdate({ type: e.target.value as FilterRule['type'] })} className="flex-1 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none">
          <option value="name">Name / path</option>
          <option value="tag">Tag</option>
          <option value="date">Date modified</option>
        </select>
        <select value={rule.action} onChange={(e) => onUpdate({ action: e.target.value as FilterAction })} className="border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none">
          <option value="color">Color</option>
          <option value="hide">Hide</option>
        </select>
        {rule.action === 'color' && <input type="color" value={rule.color} onChange={(e) => onUpdate({ color: e.target.value })} className="w-6 h-6 cursor-pointer border-0 rounded p-0 bg-transparent" />}
        <button onClick={onRemove} className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors leading-none px-0.5">✕</button>
      </div>
      {(rule.type === 'name' || rule.type === 'tag') && (
        <div className="flex items-center gap-1">
          <span className={lbl}>{rule.type === 'name' ? 'Regex' : 'Tag'}</span>
          <input type="text" value={rule.pattern} onChange={(e) => onUpdate({ pattern: e.target.value })} placeholder={rule.type === 'name' ? 'e.g. .*journal.* or todo|inbox' : 'e.g. work|project'} className={inp} />
        </div>
      )}
      {rule.type === 'date' && (
        <>
          <div className="flex items-center gap-1"><span className={lbl}>From</span><input type="date" value={rule.startDate} onChange={(e) => onUpdate({ startDate: e.target.value })} className={inp} /></div>
          <div className="flex items-center gap-1"><span className={lbl}>To</span><input type="date" value={rule.endDate} onChange={(e) => onUpdate({ endDate: e.target.value })} className={inp} /></div>
        </>
      )}
    </div>
  )
}
