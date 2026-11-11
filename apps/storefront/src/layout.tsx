// Layout sections: a tree of boxes (flex containers) and elements, drawn as plain HTML plus one generated stylesheet.
// Every style value was checked by readContent against a fixed list or range, so it goes into CSS as it is.
import type { ReactNode } from 'react'
import { IconBadge } from './icons/Icon.tsx'
import { cleanRichText, isRich } from './rich.ts'
import { videoEmbed, walk, type Content, type NodeStyle, type PageNode, type Section } from './schema.ts'
import { SectionView, type Ctx } from './sections.tsx'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
export const rootGap = 24
export const boxGap = 16
// Rows stack on phones unless the seller says otherwise.
export function directionOf(node: { style?: NodeStyle; mobile?: NodeStyle }, mobile: boolean): 'row' | 'column' {
  const dir = mobile ? node.mobile?.direction : node.style?.direction
  return typeof dir === 'string' && dir.startsWith('row') ? 'row' : 'column'
}

export function LayoutSection({ s, ctx, orderId }: { s: Section; ctx: Ctx; orderId?: string }) {
  const children = s.children ?? []
  return (
    <section className="sf-section sf-layout">
      {ctx.preview && <button type="button" className="sf-n-handle sf-n-handle--section" data-select={s.id} aria-label="সেকশন বাছুন">{ctx.handleIcon?.(s.id) ?? <span aria-hidden="true">▭</span>}</button>}
      <div className="sf-wrap sf-n-root">
        {children.length ? children.map((node) => <NodeView key={node.id} node={node} ctx={ctx} orderId={orderId} />) : ctx.preview ? <span className="sf-n-empty sf-n-add" data-add-into={s.id}>+ এলিমেন্ট যোগ করুন</span> : null}
      </div>
    </section>
  )
}

function NodeView({ node, ctx, orderId }: { node: PageNode; ctx: Ctx; orderId?: string }): ReactNode {
  if (node.hide === 'all') return null
  const className = `sf-n sf-n-${node.kind} n-${node.id}`
  const p = node.props
  switch (node.kind) {
    case 'box':
      return <div className={className} data-node={node.id}>{ctx.preview && <button type="button" className="sf-n-handle" data-select={node.id} aria-label="বক্স বাছুন">{ctx.handleIcon?.(node.id) ?? <span aria-hidden="true">▦</span>}</button>}{(node.children ?? []).map((child) => <NodeView key={child.id} node={child} ctx={ctx} orderId={orderId} />)}{ctx.preview && !node.children?.length && <span className="sf-n-empty sf-n-add" data-add-into={node.id}>+ এলিমেন্ট যোগ করুন</span>}</div>
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].includes(str(p.level)) ? p.level : 'h2') as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p'
      if (!str(p.text)) return ctx.preview ? <Tag className={`${className} sf-n-prompt`} data-node={node.id} data-edit="text">শিরোনাম লিখুন</Tag> : null
      return <Tag className={className} data-node={node.id} data-edit="text">{str(p.text)}</Tag>
    }
    case 'text':
      if (!str(p.text)) return ctx.preview ? <div className={`${className} sf-n-prompt`} data-node={node.id} data-edit="text"><p>এখানে লেখা যোগ করুন</p></div> : null
      return isRich(str(p.text))
        ? <div className={className} data-node={node.id} data-edit="rich" dangerouslySetInnerHTML={{ __html: cleanRichText(str(p.text)) }} />
        : <div className={className} data-node={node.id} data-edit="text">{str(p.text).split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>
    case 'image': {
      const img = ctx.image(p.image as string | null)
      if (!img) return ctx.preview ? <div className={`${className} sf-n-placeholder`} data-node={node.id}>ছবি বেছে নিন</div> : null
      const picture = <img src={img.url} alt={img.alt} width={img.width} height={img.height} loading="lazy" decoding="async" />
      return str(p.link) ? <a className={className} data-node={node.id} href={str(p.link)}>{picture}</a> : <div className={className} data-node={node.id}>{picture}</div>
    }
    case 'button': {
      const href = str(p.link) || (orderId ? `#${orderId}` : '')
      const inner = <><IconBadge name={str(p.icon)} /><span data-edit="text">{str(p.text)}</span></>
      const cls = `${className} sf-button${p.variant === 'outline' ? ' sf-button--outline' : ''}`
      return href && !ctx.preview ? <a className={cls} data-node={node.id} href={href}>{inner}</a> : <span className={cls} data-node={node.id}>{inner}</span>
    }
    case 'icon':
      return <span className={className} data-node={node.id}><IconBadge name={str(p.icon) || 'check'} /></span>
    case 'divider':
      return <hr className={className} data-node={node.id} />
    case 'spacer':
      return <div className={className} data-node={node.id} aria-hidden="true" />
    case 'block':
      return node.block ? <div className={className} data-node={node.id}><SectionView s={{ id: node.id, type: node.block.type, hidden: false, settings: node.block.settings }} ctx={ctx} orderId={orderId} /></div> : null
    case 'video': {
      const src = videoEmbed(str(p.url))
      if (!src) return ctx.preview ? <div className={`${className} sf-n-placeholder`} data-node={node.id}>ইউটিউব বা ফেসবুক লিংক দিন</div> : null
      return <div className={className} data-node={node.id}><iframe src={src} title="ভিডিও" loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen /></div>
    }
  }
}

const justify: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' }
const align: Record<string, string> = { stretch: 'stretch', start: 'flex-start', center: 'center', end: 'flex-end' }
const shadows: Record<string, string> = { none: 'none', soft: '0 6px 24px #00000014', strong: '0 14px 40px #0000002e' }

// The node's own look: everything except its width, which depends on the box it sits in.
const borderSides = ['Top', 'Right', 'Bottom', 'Left'] as const
const hasBorder = (st: NodeStyle) => typeof st.borderWidth === 'number' || borderSides.some((side) => typeof st[`border${side}Width`] === 'number')

// base: the desktop style when st is the phone override, so phone rules only add to it.
function declarations(node: PageNode, st: NodeStyle, ctx: Ctx, base: NodeStyle = {}): string[] {
  const out: string[] = []
  const n = (key: string) => (typeof st[key] === 'number' ? st[key] as number : undefined)
  if (node.kind === 'box' && st.display === 'grid') out.push('display:grid')
  if (node.kind === 'box' && n('gridColumns') !== undefined) out.push(`grid-template-columns:repeat(${n('gridColumns')},minmax(0,1fr))`)
  if (node.kind === 'box' && n('gridRows') !== undefined) out.push(`grid-template-rows:repeat(${n('gridRows')},auto)`)
  if (node.kind === 'box') {
    if (st.direction) out.push(`flex-direction:${st.direction}`)
    if (st.justify) out.push(`justify-content:${justify[st.justify as string]}`)
    if (st.align) out.push(`align-items:${align[st.align as string]}`)
    if (st.wrap) out.push(`flex-wrap:${st.wrap}`)
    if (n('gap') !== undefined) out.push(`gap:${n('gap')}px`)
  }
  if (n('maxWidth') !== undefined) out.push(`max-width:${n('maxWidth')}px`)
  if (n('minHeight') !== undefined) out.push(node.kind === 'spacer' ? `height:${n('minHeight')}px` : `min-height:${n('minHeight')}px`)
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    if (n(`padding${side}`) !== undefined) out.push(`padding-${side.toLowerCase()}:${n(`padding${side}`)}px`)
    if (n(`margin${side}`) !== undefined) out.push(`margin-${side.toLowerCase()}:${n(`margin${side}`)}px`)
  }
  if (st.textAlign) {
    if (node.kind === 'button' || node.kind === 'icon') out.push(`align-self:${({ left: 'flex-start', center: 'center', right: 'flex-end' } as Record<string, string>)[st.textAlign as string]}`)
    else out.push(`text-align:${st.textAlign}`)
  }
  if (n('fontSize') !== undefined) out.push(`font-size:${n('fontSize')}px`)
  if (st.fontWeight) out.push(`font-weight:${st.fontWeight}`)
  if (st.color) out.push(`color:${st.color}`, `--sf-ink:${st.color}`, `--sf-muted:${st.color}`)
  if (st.background) out.push(node.kind === 'button' ? `--sf-accent:${st.background}` : `background-color:${st.background}`)
  if (typeof st.backgroundImage === 'string') {
    const img = ctx.image(st.backgroundImage)
    if (img) out.push(`background-image:url(${JSON.stringify(img.url.replace(/[<>]/g, encodeURIComponent))})`, 'background-size:cover', 'background-position:center')
  }
  if (n('radius') !== undefined) out.push(`border-radius:${n('radius')}px`)
  // Border: widths per side (or the older all-sides borderWidth). Where this rule is the first to give the node a
  // border (desktop, or a phone border with none on desktop), unset sides start at 0 and style/colour get defaults;
  // otherwise only what this rule sets is written, so phone overrides keep the desktop values.
  const fresh = hasBorder(st) && !hasBorder(base)
  if (fresh || n('borderWidth') !== undefined) out.push(`border-width:${n('borderWidth') ?? 0}px`)
  for (const side of borderSides) if (n(`border${side}Width`) !== undefined) out.push(`border-${side.toLowerCase()}-width:${n(`border${side}Width`)}px`)
  if (fresh) out.push(`border-style:${st.borderStyle ?? base.borderStyle ?? 'solid'}`, `border-color:${st.borderColor ?? base.borderColor ?? 'var(--sf-rule)'}`)
  else {
    if (st.borderStyle && (hasBorder(st) || hasBorder(base))) out.push(`border-style:${st.borderStyle}`)
    if (st.borderColor) out.push(`border-color:${st.borderColor}`)
  }
  if (st.shadow) out.push(`box-shadow:${shadows[st.shadow as string]}`)
  return out
}

// Item settings that must win over the width rules, so they are written after them.
function itemRules(st: NodeStyle | undefined): string[] {
  if (!st) return []
  const out: string[] = []
  if (typeof st.colSpan === 'number') out.push(`grid-column:span ${st.colSpan}`)
  if (typeof st.rowSpan === 'number') out.push(`grid-row:span ${st.rowSpan}`)
  if (st.alignSelf) out.push(`align-self:${align[st.alignSelf as string]}`)
  if (st.grow === 'grow') out.push('flex-grow:1')
  if (st.grow === 'shrink') out.push('flex-shrink:1', 'flex-grow:0')
  if (st.grow === 'none') out.push('flex:none')
  if (st.order) out.push(`order:${st.order === 'first' ? -1 : 99}`)
  return out
}

// How much of its box a node takes. In a row, width is a share of the row (gaps included); in a column it is a plain width.
const grows = new Set(['box', 'heading', 'text', 'image', 'video', 'divider'])
function sizing(node: PageNode, width: number | undefined, direction: 'row' | 'column', gap: number): string[] {
  if (direction === 'row') {
    if (width !== undefined) return [`flex:0 1 calc(${width}% - ${(gap * (1 - width / 100)).toFixed(2)}px)`, 'width:auto']
    return grows.has(node.kind) ? ['flex:1 1 0', 'width:auto'] : ['flex:none', 'width:auto']
  }
  return width !== undefined ? ['flex:none', `width:${width}%`] : ['flex:none', 'width:auto']
}

// One stylesheet for every layout node on the page: desktop rules, then phone overrides under 720px.
export function layoutCss(content: Content, ctx: Ctx): string {
  const desktop: string[] = []
  const phone: string[] = []
  const hideDesktop: string[] = []
  const visit = (nodes: PageNode[], parent: PageNode | undefined) => {
    // In a grid, cells size the items; on phones a grid is one column unless a phone column count is set.
    const grid = parent?.kind === 'box' && parent.style?.display === 'grid'
    const phoneGrid = grid && parent!.mobile?.gridColumns !== undefined
    const dirD = parent ? directionOf(parent, false) : 'column'
    const dirM = parent ? directionOf(parent, true) : 'column'
    const gapD = parent ? (parent.style?.gap as number | undefined) ?? boxGap : rootGap
    const gapM = parent ? (parent.mobile?.gap as number | undefined) ?? gapD : rootGap
    for (const node of nodes) {
      const sel = `.n-${node.id}`
      const widthD = node.style?.width as number | undefined
      const widthM = (node.mobile?.width as number | undefined) ?? (dirM === dirD ? widthD : undefined)
      const own = [...declarations(node, node.style ?? {}, ctx), ...(!grid && (parent || widthD !== undefined) ? sizing(node, widthD, dirD, gapD) : []), ...itemRules(node.style)]
      if (own.length) desktop.push(`${sel}{${own.join(';')}}`)
      const mobileOwn = node.mobile ? declarations(node, node.mobile, ctx, node.style ?? {}) : []
      if (node.kind === 'box' && node.style?.display !== 'grid' && String(node.style?.direction ?? '').startsWith('row') && !node.mobile?.direction) mobileOwn.push('flex-direction:column')
      if (node.kind === 'box' && node.style?.display === 'grid' && node.mobile?.gridColumns === undefined) mobileOwn.push('grid-template-columns:minmax(0,1fr)', 'grid-template-rows:none')
      if (grid) {
        if (!phoneGrid) mobileOwn.push('grid-column:auto', 'grid-row:auto')
        mobileOwn.push(...itemRules(node.mobile))
      } else {
        const changed = dirM !== dirD || node.mobile?.width !== undefined || (dirM === 'row' && gapM !== gapD)
        if (changed) mobileOwn.push(...sizing(node, widthM, dirM, gapM), ...itemRules({ ...node.style, ...node.mobile }))
        else mobileOwn.push(...itemRules(node.mobile))
      }
      if (node.hide === 'mobile') mobileOwn.push('display:none')
      if (mobileOwn.length) phone.push(`${sel}{${mobileOwn.join(';')}}`)
      if (node.hide === 'desktop') hideDesktop.push(`${sel}{display:none}`)
      if (node.children) visit(node.children, node)
    }
  }
  for (const section of content.sections) if (section.type === 'layout' && !section.hidden) visit(section.children ?? [], undefined)
  if (!desktop.length && !phone.length && !hideDesktop.length) return ''
  return `${desktop.join('')}${hideDesktop.length ? `@media (min-width:720px){${hideDesktop.join('')}}` : ''}${phone.length ? `@media (max-width:719.98px){${phone.join('')}}` : ''}`
}

export const hasLayout = (content: Content) => content.sections.some((s) => s.type === 'layout' && [...walk(s.children ?? [])].length > 0)

export const layoutBaseCss = `
.sf-n-root{display:flex;flex-direction:column;gap:${rootGap}px}
.sf-n-box{display:flex;flex-direction:column;gap:${boxGap}px;min-width:0;background-repeat:no-repeat}
.sf-n{box-sizing:border-box;min-width:0}
.sf-n-heading{margin:0;color:var(--sf-ink);font-weight:700;line-height:1.25;overflow-wrap:anywhere}
h1.sf-n-heading{font-size:clamp(30px,5vw,48px)}h2.sf-n-heading{font-size:clamp(24px,3.6vw,34px)}h3.sf-n-heading{font-size:clamp(20px,2.6vw,24px)}h4.sf-n-heading{font-size:19px}h5.sf-n-heading{font-size:17px}h6.sf-n-heading{font-size:15px;letter-spacing:.02em}p.sf-n-heading{font-size:16px;font-weight:400;line-height:1.6}
.sf-n-text{line-height:1.7;overflow-wrap:anywhere}.sf-n-text :is(p,ul,ol,h2,h3){margin:0 0 .8em}.sf-n-text>:last-child{margin-bottom:0}.sf-n-text :is(ul,ol){padding-inline-start:1.4em}.sf-n-text h2{font-size:1.4em;line-height:1.3}.sf-n-text h3{font-size:1.2em;line-height:1.35}.sf-n-text a{color:var(--sf-accent)}
.sf-n-image{display:block;overflow:hidden;border-radius:var(--sf-radius)}.sf-n-image img{display:block;width:100%;height:auto}
.sf-n.sf-button{margin:0;width:fit-content;gap:8px}
.sf-n-icon{display:inline-flex;width:fit-content;color:var(--sf-accent)}
.sf-n-divider{width:100%;margin:0;border:0;border-top:1px solid var(--sf-rule)}
.sf-n-spacer{height:32px}
.sf-n-video{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:var(--sf-radius);background:#000}.sf-n-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.sf-n-placeholder,.sf-n-empty{display:grid;place-items:center;min-height:96px;padding:16px;border:1px dashed var(--sf-rule);border-radius:var(--sf-radius);color:var(--sf-muted);font-size:14px}
.sf-n-empty{min-height:64px;flex:1 1 auto}
.sf-n-add{cursor:pointer;transition:border-color .12s,color .12s}.sf-n-add:hover{border-color:var(--sf-accent);color:var(--sf-accent)}
.sf-n-prompt{opacity:.45;font-style:italic}
.sf-layout{position:relative}.sf-n-box{position:relative}
.sf-n-handle{position:absolute;top:0;left:0;z-index:6;display:none;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:0;border-radius:0 0 6px 0;background:#1f7a4d;color:#fff;font-size:12px;line-height:1;cursor:pointer}
.sf-n-handle--section{width:26px;height:22px;background:#163b2e}
.sf-n-box:hover:not(:has(.sf-n:hover))>.sf-n-handle,.sf-layout:hover>.sf-n-handle{display:flex}
.sf-n-block{width:100%}.sf-n-block>.sf-section{padding:0;background:transparent}.sf-n-block .sf-wrap{max-width:none;padding:0}
`
