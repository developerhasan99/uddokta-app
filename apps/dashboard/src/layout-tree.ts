import { defOf, newNode, nodeDefs, walk, type NodeKind, type PageNode, type Section } from 'storefront/schema'
import type { Label } from 'storefront/schema'

// Pure edits on a layout section's tree. Every function returns new arrays and leaves the input untouched.

export type Found = { node: PageNode; section: Section; parent: PageNode | null; siblings: PageNode[]; index: number; depth: number }

export function findNode(sections: Section[], id: string | null): Found | null {
  if (!id) return null
  for (const section of sections) {
    if (section.type !== 'layout') continue
    const search = (nodes: PageNode[], parent: PageNode | null, depth: number): Found | null => {
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index]
        if (node.id === id) return { node, section, parent, siblings: nodes, index, depth }
        const inner = node.children && search(node.children, node, depth + 1)
        if (inner) return inner
      }
      return null
    }
    const hit = search(section.children ?? [], null, 1)
    if (hit) return hit
  }
  return null
}

// Applies fn to the child list of parentId (null = the section's top level).
function withChildren(nodes: PageNode[], parentId: string | null, fn: (children: PageNode[]) => PageNode[]): PageNode[] {
  if (parentId === null) return fn(nodes)
  return nodes.map((node) => node.id === parentId ? { ...node, children: fn(node.children ?? []) } : node.children ? { ...node, children: withChildren(node.children, parentId, fn) } : node)
}

export const updateNode = (nodes: PageNode[], id: string, fn: (node: PageNode) => PageNode): PageNode[] =>
  nodes.map((node) => node.id === id ? fn(node) : node.children ? { ...node, children: updateNode(node.children, id, fn) } : node)

export const removeNode = (nodes: PageNode[], id: string): PageNode[] =>
  nodes.filter((node) => node.id !== id).map((node) => node.children ? { ...node, children: removeNode(node.children, id) } : node)

export const insertNode = (nodes: PageNode[], parentId: string | null, index: number, node: PageNode): PageNode[] =>
  withChildren(nodes, parentId, (children) => [...children.slice(0, index), node, ...children.slice(index)])

export function moveNode(nodes: PageNode[], found: Found, delta: -1 | 1): PageNode[] {
  const to = found.index + delta
  if (to < 0 || to >= found.siblings.length) return nodes
  return withChildren(nodes, found.parent?.id ?? null, (children) => {
    const next = [...children]
    const [item] = next.splice(found.index, 1)
    next.splice(to, 0, item)
    return next
  })
}

// A copy with fresh ids everywhere, so pasted or duplicated parts never clash with the original.
export const reId = (node: PageNode, id: () => string): PageNode => ({ ...structuredClone(node), id: id(), ...(node.children ? { children: node.children.map((child) => reId(child, id)) } : {}) })
export const reIdSection = (section: Section, id: () => string): Section => ({ ...structuredClone(section), id: id(), ...(section.children ? { children: section.children.map((child) => reId(child, id)) } : {}) })

export const countNodes = (sections: Section[]) => sections.reduce((n, s) => n + [...walk(s.children ?? [])].length, 0)

// What the editor lists for a node: its kind, plus the first words of its text.
export function nodeName(node: PageNode, L: (label: Label) => string) {
  const text = typeof node.props.text === 'string' ? node.props.text.trim().split('\n')[0].slice(0, 40) : ''
  if (node.block) return L(defOf(node.block.type).label)
  return text || L(nodeDefs[node.kind].label)
}

type Build = (id: () => string) => PageNode
const box = (id: () => string, style: PageNode['style'], children: PageNode[]): PageNode => ({ ...newNode('box', id), ...(style ? { style } : {}), children })
const el = (kind: NodeKind, id: () => string, props: PageNode['props'] = {}, style?: PageNode['style']): PageNode => {
  const node = newNode(kind, id)
  return { ...node, props: { ...node.props, ...props }, ...(style ? { style } : {}) }
}

// Ready-made pieces offered next to the single elements. Plain trees: once added they edit like anything else.
export const layoutPresets: { key: string; label: Label; help: Label; build: Build }[] = [
  { key: 'columns2', label: ['দুই কলাম', 'Two columns'], help: ['পাশাপাশি দুটি বক্স, ফোনে নিচে নিচে', 'Two boxes side by side, stacked on phones'],
    build: (id) => box(id, { direction: 'row', gap: 24 }, [box(id, undefined, [el('heading', id, { level: 'h3' }), el('text', id)]), box(id, undefined, [el('heading', id, { level: 'h3' }), el('text', id)])]) },
  { key: 'columns3', label: ['তিন কলাম', 'Three columns'], help: ['তিনটি সমান বক্স, যেমন সুবিধা বা ধাপ', 'Three equal boxes, like benefits or steps'],
    build: (id) => box(id, { direction: 'row', gap: 20 }, [1, 2, 3].map(() => box(id, { paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20, radius: 16, borderWidth: 1 }, [el('icon', id), el('heading', id, { level: 'h3', text: 'সুবিধার নাম' }), el('text', id, { text: 'এক-দুই লাইনে বুঝিয়ে লিখুন।' })]))) },
  { key: 'imageText', label: ['ছবি আর লেখা', 'Image and text'], help: ['এক পাশে ছবি, অন্য পাশে লেখা ও বাটন', 'An image beside text and a button'],
    build: (id) => box(id, { direction: 'row', gap: 32, align: 'center' }, [el('image', id, {}, { width: 50 }), box(id, { width: 50 }, [el('heading', id), el('text', id), el('button', id)])]) },
  { key: 'banner', label: ['রঙিন ব্যানার', 'Colour banner'], help: ['রঙিন পটভূমিতে মাঝখানে শিরোনাম ও বাটন', 'A centred heading and button on a coloured band'],
    build: (id) => box(id, { align: 'center', textAlign: 'center', paddingTop: 48, paddingBottom: 48, paddingLeft: 24, paddingRight: 24, radius: 20, background: '#163b2e', color: '#ffffff' }, [el('heading', id, { level: 'h2', text: 'আজই অর্ডার করুন' }), el('text', id, { text: 'আপনার অফার বা আহ্বান এখানে লিখুন।' }), el('button', id, {}, { background: '#e2c86c', color: '#163b2e' })]) },
]

// What a new layout section starts with: something to click on, not an empty box.
export const starterNodes = (id: () => string): PageNode[] => [el('heading', id), el('text', id), el('button', id)]

function locate(nodes: PageNode[], id: string, parentId: string | null = null): { parentId: string | null; index: number; node: PageNode } | null {
  for (let index = 0; index < nodes.length; index++) {
    if (nodes[index].id === id) return { parentId, index, node: nodes[index] }
    const inner = nodes[index].children && locate(nodes[index].children!, id, nodes[index].id)
    if (inner) return inner
  }
  return null
}

// Drag and drop inside one layout section. Returns null for a drop that makes no sense (onto itself or into its own box).
export function relocate(nodes: PageNode[], id: string, targetId: string, where: 'before' | 'after' | 'inside'): PageNode[] | null {
  const moving = locate(nodes, id)
  if (!moving || id === targetId || locate(moving.node.children ?? [], targetId)) return null
  const rest = removeNode(nodes, id)
  const target = locate(rest, targetId)
  if (!target) return null
  if (where === 'inside') return target.node.kind === 'box' ? insertNode(rest, targetId, target.node.children?.length ?? 0, moving.node) : null
  return insertNode(rest, target.parentId, target.index + (where === 'after' ? 1 : 0), moving.node)
}

// The section and boxes that contain a node, outermost first, so the tree can open down to it.
export function pathTo(sections: Section[], id: string): string[] {
  for (const section of sections) {
    if (section.id === id) return [section.id]
    const search = (nodes: PageNode[], trail: string[]): string[] | null => {
      for (const n of nodes) {
        if (n.id === id) return trail
        const inner = n.children && search(n.children, [...trail, n.id])
        if (inner) return inner
      }
      return null
    }
    const hit = search(section.children ?? [], [section.id])
    if (hit) return hit
  }
  return []
}

// What "Add section" offers: generic building pieces, not purpose-made sections. Specific things (order form,
// reviews, FAQ, …) are blocks placed inside these from "Add element".
export const sectionPresets: { key: string; label: Label; help: Label; build: (id: () => string) => PageNode[] }[] = [
  { key: 'empty', label: ['খালি সেকশন', 'Empty section'], help: ['শূন্য থেকে নিজের মতো সাজান', 'Start from nothing and build your own'], build: () => [] },
]

// "Structure" in Add element: one box, or a row of 2–4 equal column boxes (stacked on phones). More columns or
// rows are just more boxes, added like anything else.
export const columns = (n: number, id: () => string): PageNode => ({ ...box(id, { display: 'grid', gridColumns: n, gridRows: 1, gap: 20 }, Array.from({ length: n }, () => box(id, undefined, []))) })

// The Columns × Rows settings on a grid box: one empty cell box per cell is added, and empty ones are taken off the
// end when the grid shrinks. A cell with content is never removed here, so nothing is lost; the result says so.
export function setGrid(node: PageNode, cols: number, rows: number, id: () => string): { node: PageNode; blocked: boolean } {
  const cells = cols * rows
  const children = [...(node.children ?? [])]
  while (children.length < cells) children.push(box(id, undefined, []))
  let blocked = false
  while (children.length > cells) {
    const last = children[children.length - 1]
    if (last.kind !== 'box' || last.children?.length) { blocked = true; break }
    children.pop()
  }
  return { node: { ...node, children, style: { ...node.style, display: 'grid', gridColumns: cols, gridRows: rows } }, blocked }
}

// Copy and paste between pages: the copied section or element is kept in this browser.
// What is pasted gets fresh ids, and the API checks it like any other content when the page is saved.
export type Clip = { kind: 'section'; section: Section } | { kind: 'node'; node: PageNode }
const clipKey = 'uddokta.page-clipboard'
export function writeClip(clip: Clip) {
  try { localStorage.setItem(clipKey, JSON.stringify(clip)) } catch { /* storage blocked: copy is lost */ }
}
export function readClip(): Clip | null {
  try {
    const clip = JSON.parse(localStorage.getItem(clipKey) ?? 'null') as Clip | null
    if (clip?.kind === 'section' && clip.section?.type === 'layout') return clip
    if (clip?.kind === 'node' && clip.node?.kind) return clip
  } catch { /* storage blocked or garbled */ }
  return null
}

// How many boxes deep a part goes (a box with a box inside is 2), and how many boxes sit above a place in a section.
// Together they keep pasted, dropped or added parts within maxBoxDepth.
export const boxDepth = (node: PageNode): number => (node.kind === 'box' ? 1 : 0) + Math.max(0, ...(node.children ?? []).map(boxDepth))
export function boxesAbove(sections: Section[], parentId: string | null) {
  if (!parentId) return 0
  return pathTo(sections, parentId).length - 1 + (findNode(sections, parentId)?.node.kind === 'box' ? 1 : 0)
}
