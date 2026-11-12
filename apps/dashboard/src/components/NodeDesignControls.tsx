import { useId, useState, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalSpaceBetween, AlignHorizontalSpaceAround, AlignHorizontalDistributeCenter, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalSpaceBetween, AlignVerticalSpaceAround, AlignVerticalDistributeCenter, AlignStartVertical, AlignCenterVertical, AlignEndVertical, StretchVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, StretchHorizontal, Crosshair, Image as ImageIcon, Layers, Monitor, Move, MousePointer2, Palette, Sparkles, RotateCcw, Link2, Unlink2, Timer, Smartphone, Square, SlidersHorizontal, Type } from 'lucide-react'
import { nodeStyleFields, type Leaf, type NodeStyle, type PageNode } from 'storefront/schema'
import type { MediaItem } from '../api'
import { useLang } from '../i18n'
import { BackgroundTypeRow, ColorControl, GradientControls, Group, NumericInput } from './SectionDesignControls'

export type Device = 'desktop' | 'mobile'
export type State = 'normal' | 'hover'
type Patch = Record<string, string | number | undefined>
type Props = {
  node: PageNode
  tab: 'layout' | 'style'
  device: Device
  // Style tab only: 'hover' edits the values used while a pointer is over the node.
  state?: State
  media: Record<string, MediaItem>
  onPatch: (patch: Patch, typingKey?: string) => void
  onHide: (hide: PageNode['hide']) => void
  onPickImage: (apply: (id: string | null) => void) => void
  grid?: { columns: number; rows: number; set: (columns: number, rows: number) => boolean }
  parentGrid?: { columns: number; rows: number }
}

const fieldOf = (key: string) => nodeStyleFields.find((f) => f.key === key)!

// Layout and Style for one box or element. On "Mobile" the same controls write phone overrides, with the desktop value as the hint.
export function NodeDesignControls({ node, tab, device, state = 'normal', media, onPatch, onHide, onPickImage, grid, parentGrid }: Props) {
  const [blocked, setBlocked] = useState(false)
  const [linked, setLinked] = useState({ padding: false, margin: false, border: true, radius: true })
  const { lang } = useLang()
  const uid = useId()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const labelOf = (field: Leaf) => field.label[lang === 'bn' ? 0 : 1]
  const hover = tab === 'style' && state === 'hover'
  const own = (hover ? node.hover : device === 'mobile' ? node.mobile : node.style) ?? {}
  const desktop = node.style ?? {}
  // Mobile and hover values fall back to the normal desktop ones, which show as hints.
  const inheriting = hover || device === 'mobile'
  const value = (key: string) => own[key]
  const reset = (keys: string[]) => <button type="button" className="design-reset" disabled={keys.every((k) => own[k] === undefined)} onClick={() => onPatch(Object.fromEntries(keys.map((k) => [k, undefined])))} aria-label={L('ডিফল্ট করুন', 'Reset')} title={L('ডিফল্ট মান ব্যবহার করুন', 'Use the default')}><RotateCcw size={12} aria-hidden="true" /></button>

  const number = (key: string, label?: string, unit = 'px') => {
    const field = fieldOf(key) as Extract<Leaf, { kind: 'number' }>
    const id = `${uid}-${key}`
    const hint = inheriting && desktop[key] !== undefined ? String(desktop[key]) : undefined
    return <div className="design-control" key={key}>
      <div className="design-control__label"><label htmlFor={id}>{label ?? labelOf(field).replace(/ \((px|%)\)$/, '')}</label>{reset([key])}</div>
      <div className="input-affix design-number"><NumericInput id={id} field={field} value={value(key)} placeholder={hint} onChange={(v) => onPatch({ [key]: v }, key)} /><span aria-hidden="true">{unit}</span></div>
    </div>
  }
  const segments = (key: string, label: string, items: { value: string; label: string; icon?: ReactNode }[]) => (
    <div className={items.length > 4 ? 'design-control design-control--stacked' : 'design-control'} key={key}>
      <div className="design-control__label"><span>{label}</span>{reset([key])}</div>
      <div className="design-segments" role="group" aria-label={label}>
        {items.map((item) => <button key={item.value} type="button" aria-pressed={value(key) === item.value} title={item.label} aria-label={item.label} onClick={() => onPatch({ [key]: value(key) === item.value ? undefined : item.value })}>{item.icon}{item.icon ? null : item.label}</button>)}
      </div>
    </div>
  )
  const select = (key: string, label?: string, empty?: string) => {
    const field = fieldOf(key) as Extract<Leaf, { kind: 'select' }>
    const id = `${uid}-${key}`
    return <div className="design-control" key={key}>
      <div className="design-control__label"><label htmlFor={id}>{label ?? labelOf(field)}</label>{reset([key])}</div>
      <select className="input" id={id} value={String(value(key) ?? '')} onChange={(e) => onPatch({ [key]: e.target.value || undefined })}>
        <option value="">{empty ?? (hover ? L('সাধারণের মতো', 'Same as normal') : device === 'mobile' ? L('ডেস্কটপের মতো', 'Same as desktop') : L('ডিফল্ট', 'Default'))}</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label[lang === 'bn' ? 0 : 1]}</option>)}
      </select>
    </div>
  }
  const color = (key: string, inherited: string) => <ColorControl key={key} id={`${uid}-${key}`} label={labelOf(fieldOf(key))} value={String(value(key) ?? '')} inherited={String(inheriting ? desktop[key] ?? inherited : inherited)} onChange={(v, typing) => onPatch({ [key]: v || undefined }, typing ? key : undefined)} />
  // Joined side fields with a link button at the end that edits every side together (padding, margin, border widths).
  const sideNames: Record<string, string> = { Top: L('উপর', 'Top'), Right: L('ডান', 'Right'), Bottom: L('নিচ', 'Bottom'), Left: L('বাম', 'Left'), TopLeft: L('উপর-বাম', 'Top left'), TopRight: L('উপর-ডান', 'Top right'), BottomRight: L('নিচ-ডান', 'Bottom right'), BottomLeft: L('নিচ-বাম', 'Bottom left') }
  const sideFields = (kind: 'padding' | 'margin' | 'border' | 'radius', label: string) => {
    const sides = kind === 'margin' ? ['Top', 'Bottom'] : kind === 'radius' ? ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] : ['Top', 'Right', 'Bottom', 'Left']
    const keyOf = (side: string) => kind === 'border' ? `border${side}Width` : `${kind}${side}`
    const legacyKey = kind === 'border' ? 'borderWidth' : kind === 'radius' ? 'radius' : undefined
    // Older pages keep one border width or corner size for all sides; it shows in every field and is split up on the first edit.
    const legacy = legacyKey ? value(legacyKey) : undefined
    const set = (side: string, v: number | undefined) => {
      const patch: Patch = Object.fromEntries((linked[kind] ? sides : [side]).map((s) => [keyOf(s), v]))
      if (legacy !== undefined) {
        for (const s of sides) if (!(keyOf(s) in patch)) patch[keyOf(s)] = value(keyOf(s)) ?? legacy
        patch[legacyKey!] = undefined
      }
      onPatch(patch, `${kind}:${linked[kind] ? 'all' : side}`)
    }
    return <div className="node-spacing" key={kind}>
      <div className="design-control__label"><span>{label}</span>{reset([...sides.map(keyOf), ...(legacyKey ? [legacyKey] : [])])}<span className="spacing-row__unit" aria-hidden="true">px</span></div>
      <div className="node-spacing__grid" data-count={sides.length}>
        {sides.map((side) => {
          const key = keyOf(side)
          const hint = inheriting ? desktop[key] ?? (legacyKey ? desktop[legacyKey] : undefined) : undefined
          return <label key={side} className="node-spacing__cell"><NumericInput id={`${uid}-${key}`} field={fieldOf(key) as Extract<Leaf, { kind: 'number' }>} value={value(key) ?? legacy} placeholder={hint !== undefined ? String(hint) : undefined} onChange={(v) => set(side, v)} />{kind === 'radius'
            ? <span title={sideNames[side]}><i className={`corner-mark corner-mark--${side}`} aria-hidden="true" /><span className="visually-hidden">{sideNames[side]}</span></span>
            : <span>{sideNames[side]}</span>}</label>
        })}
        <button className="spacing-row__link" type="button" aria-pressed={linked[kind]} title={L('সব দিক একসাথে', 'Link all sides')} aria-label={`${label}: ${L('সব দিক একসাথে বদলান', 'Link all sides')}`} onClick={() => setLinked((l) => ({ ...l, [kind]: !l[kind] }))}>{linked[kind] ? <Link2 size={14} aria-hidden="true" /> : <Unlink2 size={14} aria-hidden="true" />}</button>
      </div>
    </div>
  }
  const isBox = node.kind === 'box'
  const textual = ['heading', 'text', 'button', 'box'].includes(node.kind)

  if (tab === 'layout') return <div className="design-controls">
    {isBox && (() => {
      const dir = String(value('direction') ?? (device === 'mobile' ? 'column' : desktop.direction ?? 'column'))
      const row = dir.startsWith('row')
      const i = (Icon: typeof ArrowDown) => <Icon size={16} aria-hidden="true" />
      const isGrid = desktop.display === 'grid'
      return <Group title={L('সাজানো', 'Arrangement')} icon={<SlidersHorizontal size={15} />}>
        {device === 'desktop' && <div className="design-control">
          <div className="design-control__label"><span>{L('ধরন', 'Layout')}</span></div>
          <div className="design-segments" role="group" aria-label={L('ধরন', 'Layout')}>
            <button type="button" aria-pressed={!isGrid} onClick={() => onPatch({ display: undefined, gridColumns: undefined, gridRows: undefined })}>{L('ফ্লেক্স', 'Flex')}</button>
            <button type="button" aria-pressed={isGrid} onClick={() => grid ? setBlocked(!grid.set(Math.max(1, grid.columns), Math.max(1, grid.rows))) : onPatch({ display: 'grid', gridColumns: 2, gridRows: 1 })}>{L('গ্রিড', 'Grid')}</button>
          </div>
        </div>}
        {isGrid && grid && device === 'desktop' && <>
          <Stepper label={L('কলাম', 'Columns')} value={grid.columns} max={6} onChange={(c) => setBlocked(!grid.set(c, grid.rows))} />
          <Stepper label={L('সারি', 'Rows')} value={grid.rows} max={6} onChange={(r) => setBlocked(!grid.set(grid.columns, r))} />
          {blocked && <p className="design-help form-error">{L('শেষের ঘরে জিনিস আছে। আগে সেগুলো সরান বা মুছুন।', 'The last cells have things in them. Move or delete them first.')}</p>}
        </>}
        {isGrid && device === 'mobile' && <>
          <Stepper label={L('ফোনে কলাম', 'Columns on phones')} value={Number(value('gridColumns') ?? 1)} max={4} onChange={(c) => onPatch({ gridColumns: c === 1 ? undefined : c })} />
          <p className="design-help">{L('ফোনে গ্রিড নিজে থেকেই এক কলাম হয়।', 'On phones a grid is one column unless you choose more.')}</p>
        </>}
        {isGrid ? <div className="design-grid">{number('gap')}</div> : <>
        {segments('direction', L('দিক', 'Direction'), [
          { value: 'row', label: L('পাশাপাশি', 'Across'), icon: i(ArrowRight) },
          { value: 'column', label: L('নিচে নিচে', 'Down'), icon: i(ArrowDown) },
          { value: 'row-reverse', label: L('ডান থেকে বামে', 'Across, reversed'), icon: i(ArrowLeft) },
          { value: 'column-reverse', label: L('নিচ থেকে উপরে', 'Up'), icon: i(ArrowUp) },
        ])}
        {device === 'mobile' && <p className="design-help">{L('ডেস্কটপে পাশাপাশি থাকলে ফোনে নিজে থেকেই নিচে নিচে আসে।', 'Boxes side by side on desktop stack on phones unless you choose a direction here.')}</p>}
        {segments('justify', L('মূল দিকে সাজানো', 'Justify content'), [
          { value: 'start', label: L('শুরুতে', 'Start'), icon: i(row ? AlignHorizontalJustifyStart : AlignVerticalJustifyStart) },
          { value: 'center', label: L('মাঝে', 'Center'), icon: i(row ? AlignHorizontalJustifyCenter : AlignVerticalJustifyCenter) },
          { value: 'end', label: L('শেষে', 'End'), icon: i(row ? AlignHorizontalJustifyEnd : AlignVerticalJustifyEnd) },
          { value: 'between', label: L('ছড়িয়ে', 'Space between'), icon: i(row ? AlignHorizontalSpaceBetween : AlignVerticalSpaceBetween) },
          { value: 'around', label: L('চারপাশে ফাঁক', 'Space around'), icon: i(row ? AlignHorizontalSpaceAround : AlignVerticalSpaceAround) },
          { value: 'evenly', label: L('সমান ফাঁক', 'Space evenly'), icon: i(row ? AlignHorizontalDistributeCenter : AlignVerticalDistributeCenter) },
        ])}
        {segments('align', L('আড়াআড়ি সাজানো', 'Align items'), [
          { value: 'start', label: L('শুরুতে', 'Start'), icon: i(row ? AlignStartHorizontal : AlignStartVertical) },
          { value: 'center', label: L('মাঝে', 'Center'), icon: i(row ? AlignCenterHorizontal : AlignCenterVertical) },
          { value: 'end', label: L('শেষে', 'End'), icon: i(row ? AlignEndHorizontal : AlignEndVertical) },
          { value: 'stretch', label: L('পুরো জায়গা', 'Stretch'), icon: i(row ? StretchVertical : StretchHorizontal) },
        ])}
        <div className="design-grid">{number('gap')}{select('wrap')}</div>
        </>}
      </Group>
    })()}
    <Group title={L('বক্সের ভেতরে অবস্থান', 'Position in its box')} icon={<Crosshair size={15} />} open={false}>
      {parentGrid && <>
        <Stepper label={L('কলাম জুড়ে', 'Column span')} value={Number(value('colSpan') ?? 1)} max={parentGrid.columns} onChange={(n) => onPatch({ colSpan: n === 1 ? undefined : n })} />
        <Stepper label={L('সারি জুড়ে', 'Row span')} value={Number(value('rowSpan') ?? 1)} max={Math.max(parentGrid.rows, 1)} onChange={(n) => onPatch({ rowSpan: n === 1 ? undefined : n })} />
      </>}
      {segments('alignSelf', L('নিজের অবস্থান', 'Align self'), [
        { value: 'start', label: L('শুরুতে', 'Start'), icon: <AlignStartVertical size={16} aria-hidden="true" /> },
        { value: 'center', label: L('মাঝে', 'Center'), icon: <AlignCenterVertical size={16} aria-hidden="true" /> },
        { value: 'end', label: L('শেষে', 'End'), icon: <AlignEndVertical size={16} aria-hidden="true" /> },
        { value: 'stretch', label: L('পুরো জায়গা', 'Stretch'), icon: <StretchHorizontal size={16} aria-hidden="true" /> },
      ])}
      {segments('grow', L('মাপ', 'Size'), [{ value: 'none', label: L('নিজের মাপে', 'Fit') }, { value: 'grow', label: L('বড় হোক', 'Grow') }, { value: 'shrink', label: L('ছোট হোক', 'Shrink') }])}
      {segments('order', L('ক্রম', 'Order'), [{ value: 'first', label: L('সবার আগে', 'First') }, { value: 'last', label: L('সবার শেষে', 'Last') }])}
      <p className="design-help">{L('বাক্সের অন্য জিনিসের তুলনায় এটি কোথায় ও কত জায়গা নেবে। ক্রম বদলালে শুধু দেখানো বদলায়, তালিকা নয়।', 'Where this sits among the other things in its box, and how much room it takes. Order changes only what buyers see, not the list.')}</p>
    </Group>
    <Group title={L('মাপ', 'Size')} icon={<Move size={15} />}>
      <div className="design-grid">{number('width', undefined, '%')}{number('maxWidth')}</div>
      {number('minHeight', node.kind === 'spacer' ? L('উচ্চতা', 'Height') : undefined)}
      {node.kind !== 'spacer' && <p className="design-help">{L('পাশাপাশি থাকলে প্রস্থ হলো সারির ভাগ। ফাঁকা রাখলে সমান ভাগ হয়।', 'In a row, width is a share of the row. Leave it blank to share equally.')}</p>}
    </Group>
    <Group title={L('ফাঁকা জায়গা', 'Spacing')} icon={<Square size={15} />}>{sideFields('padding', L('ভেতরের ফাঁকা (প্যাডিং)', 'Padding'))}{sideFields('margin', L('বাইরের ফাঁকা (মার্জিন)', 'Margin'))}</Group>
    {node.kind === 'button' && <Group title={L('অ্যানিমেশন', 'Animation')} icon={<Sparkles size={15} />}>
      {device === 'desktop' ? <>
        {select('animation', L('অ্যানিমেশন', 'Animation'), L('নেই', 'None'))}
        {value('animation') !== undefined && select('animationSpeed', L('গতি', 'Speed'), L('স্বাভাবিক', 'Normal'))}
        <p className="design-help">{L('বাটনকে আলাদা করে চোখে পড়াতে। সব স্ক্রিনে একই থাকে; যারা কম নড়াচড়া চান তাদের কাছে বন্ধ থাকে।', 'Makes the button stand out. The same on every screen, and off for visitors who ask for less motion.')}</p>
      </> : <p className="design-help">{L('অ্যানিমেশন সব স্ক্রিনে একই। ডেস্কটপে বদলান।', 'Animation is the same on every screen. Change it on Desktop.')}</p>}
    </Group>}
    <Group title={L('ট্রানজিশন', 'Transition')} icon={<Timer size={15} />} open={false}>
      <div className="design-grid">{number('transitionDuration', L('সময়', 'Duration'), 'ms')}{select('transitionEasing')}</div>
      <p className="design-help">{L('রং, বর্ডার, কোণা ও ছায়া কত ধীরে বদলাবে, যেমন হোভারের চেহারায় যেতে আর ফিরতে।', 'How smoothly colours, border, corners and shadow change, such as into the hover look and back.')}</p>
    </Group>
    <Group title={L('ডিভাইসে দেখানো', 'Device visibility')} icon={<Monitor size={15} />}>
      <div className="design-segments" role="group" aria-label={L('ডিভাইসে দেখানো', 'Device visibility')}>
        {([[undefined, L('সব', 'All'), Layers], ['mobile', L('ডেস্কটপ', 'Desktop'), Monitor], ['desktop', L('মোবাইল', 'Mobile'), Smartphone]] as const).map(([hide, label, Icon]) => <button key={label} type="button" aria-pressed={node.hide === hide} onClick={() => onHide(hide)}><Icon size={14} aria-hidden="true" /><span>{label}</span></button>)}
      </div>
      <p className="design-help">{node.hide === 'mobile' ? L('শুধু ডেস্কটপে দেখা যাবে।', 'Shown on desktop only.') : node.hide === 'desktop' ? L('শুধু মোবাইলে দেখা যাবে।', 'Shown on phones only.') : L('সব স্ক্রিনে দেখা যাবে।', 'Shown on every screen.')}</p>
    </Group>
  </div>

  return <div className="design-controls">
    {textual && <Group title={L('লেখা', 'Text')} icon={<Type size={15} />}>
      {segments('textAlign', L('অবস্থান', 'Alignment'), [{ value: 'left', label: L('বামে', 'Left'), icon: <AlignLeft size={16} aria-hidden="true" /> }, { value: 'center', label: L('মাঝে', 'Center'), icon: <AlignCenter size={16} aria-hidden="true" /> }, { value: 'right', label: L('ডানে', 'Right'), icon: <AlignRight size={16} aria-hidden="true" /> }])}
      <div className="design-grid">{number('fontSize', L('মাপ', 'Size'))}{select('fontWeight')}</div>
      {color('color', '#1d1d1f')}
      {node.kind !== 'button' && color('background', '')}
      {isBox && <BackgroundImage value={value('backgroundImage')} media={media} label={L('পটভূমির ছবি', 'Background image')} change={L('বদলান', 'Change')} remove={L('সরান', 'Remove')} choose={L('ছবি বেছে নিন', 'Choose image')} onPick={() => onPickImage((id) => onPatch({ backgroundImage: id ?? undefined }))} onRemove={() => onPatch({ backgroundImage: undefined })} />}
    </Group>}
    {node.kind === 'button' && (() => {
      // Classic (a colour) or a gradient; phone and hover values fall back to the normal desktop ones.
      const merged = inheriting ? { ...desktop, ...own } : own
      const type = String(merged.bgType ?? 'color')
      const setType = (t: string) => onPatch({
        bgType: t === 'gradient' ? t : inheriting && desktop.bgType === 'gradient' ? 'color' : undefined,
        ...(t === 'gradient' && !(merged.gradientFrom && merged.gradientTo) ? { gradientFrom: String(merged.gradientFrom ?? merged.background ?? '#1f7a4d'), gradientTo: String(merged.gradientTo ?? '#1d1d1f') } : {}),
      })
      return <Group title={L('পটভূমি', 'Background')} icon={<Palette size={15} />}>
        <BackgroundTypeRow value={type} types={['color', 'gradient']} onChange={setType} />
        {type === 'color' && color('background', '#1f7a4d')}
        {type === 'gradient' && <GradientControls values={merged} onPatch={onPatch} color={(key) => color(key, key === 'gradientFrom' ? '#1f7a4d' : '#1d1d1f')} number={(key, label) => number(key, label, key === 'gradientAngle' ? '°' : '%')} position={(label) => select('gradientPosition', label)} />}
      </Group>
    })()}
    {!textual && (node.kind === 'icon' || node.kind === 'image') && <Group title={L('অবস্থান', 'Position')} icon={<AlignCenter size={15} />}>
      {segments('textAlign', L('অবস্থান', 'Alignment'), [{ value: 'left', label: L('বামে', 'Left'), icon: <AlignLeft size={16} aria-hidden="true" /> }, { value: 'center', label: L('মাঝে', 'Center'), icon: <AlignCenter size={16} aria-hidden="true" /> }, { value: 'right', label: L('ডানে', 'Right'), icon: <AlignRight size={16} aria-hidden="true" /> }])}
      {node.kind === 'icon' && color('color', '#1f7a4d')}
    </Group>}
    {!textual && <Group title={node.kind === 'button' ? L('বাটনের রং', 'Button colour') : L('পটভূমি', 'Background')} icon={<Palette size={15} />}>
          {color('background', node.kind === 'button' ? '#1f7a4d' : '')}
          {isBox && <BackgroundImage value={value('backgroundImage')} media={media} label={L('পটভূমির ছবি', 'Background image')} change={L('বদলান', 'Change')} remove={L('সরান', 'Remove')} choose={L('ছবি বেছে নিন', 'Choose image')} onPick={() => onPickImage((id) => onPatch({ backgroundImage: id ?? undefined }))} onRemove={() => onPatch({ backgroundImage: undefined })} />}
        </Group>}
    <Group title={L('বর্ডার ও কোণা', 'Border & corners')} icon={<Square size={15} />} open={false}>
      {segments('borderStyle', L('বর্ডারের ধরন', 'Border type'), [{ value: 'solid', label: L('সলিড', 'Solid') }, { value: 'dashed', label: L('ড্যাশ', 'Dashed') }, { value: 'dotted', label: L('ডট', 'Dotted') }])}
      {sideFields('border', L('বর্ডারের প্রস্থ', 'Border width'))}
      {color('borderColor', '#e3e5e1')}
      {sideFields('radius', L('কোণা', 'Corners'))}
      {select('shadow')}
    </Group>
  </div>
}

export function BackgroundImage({ value, media, label, change, remove, choose, onPick, onRemove }: { value: string | number | undefined; media: Record<string, MediaItem>; label: string; change: string; remove: string; choose: string; onPick: () => void; onRemove: () => void }) {
  const item = typeof value === 'string' ? media[value] : undefined
  return <div className="design-control">
    <div className="design-control__label"><span>{label}</span></div>
    {item
      ? <div className="node-bg"><img src={item.thumbUrl} alt="" /><button type="button" className="btn btn--default" onClick={onPick}>{change}</button><button type="button" className="btn btn--default" onClick={onRemove}>{remove}</button></div>
      : <button type="button" className="media__empty editor-image__empty" onClick={onPick}><ImageIcon size={18} strokeWidth={1.5} aria-hidden="true" /><strong>{choose}</strong></button>}
  </div>
}

// Desktop / Mobile switch shown above Layout and Style.
// compact: icons only, so it shares a row with the Normal / Hover switch.
export function DeviceSwitch({ device, onChange, compact = false }: { device: Device; onChange: (d: Device) => void; compact?: boolean }) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const item = (d: Device, Icon: typeof Monitor, label: string) => <button type="button" aria-pressed={device === d} aria-label={compact ? label : undefined} title={compact ? label : undefined} onClick={() => onChange(d)}><Icon size={14} aria-hidden="true" />{!compact && <span>{label}</span>}</button>
  return <div className={compact ? 'design-segments node-device node-device--icons' : 'design-segments node-device'} role="group" aria-label={L('কোন স্ক্রিনের জন্য', 'Editing for')}>
    {item('desktop', Monitor, L('ডেস্কটপ', 'Desktop'))}{item('mobile', Smartphone, L('মোবাইল', 'Mobile'))}
  </div>
}

// Normal / Hover switch shown above the Style tab. Hover values fall back to the normal ones until set.
export function StateSwitch({ state, onChange }: { state: State; onChange: (s: State) => void }) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  return <div className="design-segments node-device" role="group" aria-label={L('অবস্থা', 'State')}>
    <button type="button" aria-pressed={state === 'normal'} onClick={() => onChange('normal')}><Square size={14} aria-hidden="true" /><span>{L('সাধারণ', 'Normal')}</span></button>
    <button type="button" aria-pressed={state === 'hover'} onClick={() => onChange('hover')}><MousePointer2 size={14} aria-hidden="true" /><span>{L('হোভার', 'Hover')}</span></button>
  </div>
}

export type { NodeStyle }

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  const { lang } = useLang()
  return <div className="design-control">
    <div className="design-control__label"><span>{label}</span></div>
    <div className="node-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} −`} disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite">{lang === 'bn' ? value.toLocaleString('bn-BD') : value}</output>
      <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  </div>
}
