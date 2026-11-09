// Every section is edited as a layout (a tree of boxes and elements). This turns a built-in section into one:
// simple sections become real elements the seller can rearrange; richer ones (order form, FAQ, reviews, gallery,
// countdown, …) become a layout holding that section as a block, so they keep working exactly as before.
import { newBlock, newNode, type NodeKind, type NodeStyle, type PageNode, type Section, type Settings } from './schema.ts'

type Id = () => string
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const list = (v: unknown) => (Array.isArray(v) ? v as Record<string, string | null>[] : [])

function node(kind: NodeKind, id: Id, props: Settings = {}, style?: NodeStyle, children?: PageNode[]): PageNode {
  const made = newNode(kind, id)
  return { ...made, props: { ...made.props, ...props }, ...(style ? { style } : {}), ...(children ? { children } : {}) }
}
const box = (id: Id, style: NodeStyle | undefined, children: PageNode[]) => node('box', id, {}, style, children)
const heading = (id: Id, text: string, level = 'h2', style?: NodeStyle) => node('heading', id, { text, level }, style)
const text = (id: Id, value: string, style?: NodeStyle) => node('text', id, { text: value }, style)
const button = (id: Id, s: Settings, textKey = 'button') => node('button', id, { text: str(s[textKey]), link: str(s.link), icon: str(s.buttonIcon) })
const image = (id: Id, value: unknown, style?: NodeStyle) => node('image', id, { image: typeof value === 'string' ? value : null }, style)

// Text, optional button and an image, side by side (or centred), as the hero and image-with-text sections were.
function split(s: Settings, id: Id, level: 'h1' | 'h2'): PageNode[] {
  const copy = [
    ...(str(s.eyebrow) ? [text(id, str(s.eyebrow), { fontSize: 14, fontWeight: '600' })] : []),
    heading(id, str(s.heading), level),
    ...(str(s.text) ? [text(id, str(s.text))] : []),
    ...(str(s.button) ? [button(id, s)] : []),
  ]
  if (s.layout === 'center') return [box(id, { align: 'center', textAlign: 'center', gap: 16 }, [...copy, image(id, s.image, { maxWidth: 720 })])]
  const words = box(id, { width: 50, gap: 16 }, copy)
  const picture = image(id, s.image, { width: 50, radius: 16 })
  return [box(id, { direction: 'row', gap: 40, align: 'center' }, s.layout === 'reverse' ? [picture, words] : [words, picture])]
}

// List sections (benefits, cards, steps, trust, icon cards/lists) become a heading over a row of cards that wraps.
function cards(s: Settings, id: Id, framed: boolean, icon?: string): PageNode[] {
  const items = list(s.items).map((item) => box(id, { width: 31, gap: 8, ...(framed ? { paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20, radius: 16, borderWidth: 1 } : {}) }, [
    ...((item.icon ?? icon) ? [node('icon', id, { icon: item.icon ?? icon! })] : []),
    ...(item.image !== undefined ? [image(id, item.image, { radius: 12 })] : []),
    heading(id, str(item.title), 'h3'),
    ...(str(item.text) ? [text(id, str(item.text))] : []),
  ]))
  return [...(str(s.heading) ? [heading(id, str(s.heading), 'h2', { textAlign: 'center' })] : []), box(id, { direction: 'row', wrap: 'wrap', gap: 20 }, items)]
}

function children(section: Section, id: Id): PageNode[] {
  const s = section.settings
  switch (section.type) {
    case 'layout': return section.children ?? []
    case 'hero': return split(s, id, 'h1')
    case 'imageText': return split(s, id, 'h2')
    case 'text': return [heading(id, str(s.heading)), text(id, str(s.body))]
    case 'image': return [image(id, s.image), ...(str(s.caption) ? [text(id, str(s.caption), { textAlign: 'center', fontSize: 14 })] : [])]
    case 'video': return [...(str(s.heading) ? [heading(id, str(s.heading), 'h2', { textAlign: 'center' })] : []), node('video', id, { url: str(s.url) })]
    case 'cta': return [box(id, { align: 'center', textAlign: 'center', gap: 16 }, [heading(id, str(s.heading)), ...(str(s.text) ? [text(id, str(s.text))] : []), ...(str(s.button) ? [button(id, s)] : [])])]
    case 'announcement': return [box(id, { direction: 'row', justify: 'center', align: 'center', gap: 16, wrap: 'wrap' }, [text(id, str(s.text)), ...(str(s.button) ? [button(id, s)] : [])])]
    case 'features': return cards(s, id, false, 'check')
    case 'iconList':
    case 'steps': return cards(s, id, false)
    case 'iconCards':
    case 'trust':
    case 'cards': return cards(s, id, true)
    default: return [newBlock(section.type, id)].map((b) => ({ ...b, block: { type: section.type, settings: structuredClone(s) } }))
  }
}

export const toLayout = (section: Section, id: Id): Section =>
  section.type === 'layout' ? section : { id: section.id, type: 'layout', hidden: section.hidden, settings: {}, ...(section.style ? { style: section.style } : {}), children: children(section, id) }
