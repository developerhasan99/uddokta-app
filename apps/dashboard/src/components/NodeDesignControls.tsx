import { useId, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalSpaceBetween, AlignHorizontalSpaceAround, AlignHorizontalDistributeCenter, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalSpaceBetween, AlignVerticalSpaceAround, AlignVerticalDistributeCenter, AlignStartVertical, AlignCenterVertical, AlignEndVertical, StretchVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, StretchHorizontal, Crosshair, Image as ImageIcon, Layers, Monitor, Move, Palette, RotateCcw, Smartphone, Square, SlidersHorizontal, Type } from 'lucide-react'
import { nodeStyleFields, type Leaf, type NodeStyle, type PageNode } from 'storefront/schema'
import type { MediaItem } from '../api'
import { useLang } from '../i18n'
import { ColorControl, Group, NumericInput } from './SectionDesignControls'

export type Device = 'desktop' | 'mobile'
type Patch = Record<string, string | number | undefined>
type Props = {
  node: PageNode
  tab: 'layout' | 'style'
  device: Device
  media: Record<string, MediaItem>
  onPatch: (patch: Patch, typingKey?: string) => void
  onHide: (hide: PageNode['hide']) => void
  onPickImage: (apply: (id: string | null) => void) => void
}

const fieldOf = (key: string) => nodeStyleFields.find((f) => f.key === key)!

// Layout and Style for one box or element. On "Mobile" the same controls write phone overrides, with the desktop value as the hint.
export function NodeDesignControls({ node, tab, device, media, onPatch, onHide, onPickImage }: Props) {
  const { lang } = useLang()
  const uid = useId()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const labelOf = (field: Leaf) => field.label[lang === 'bn' ? 0 : 1]
  const own = (device === 'mobile' ? node.mobile : node.style) ?? {}
  const desktop = node.style ?? {}
  const value = (key: string) => own[key]
  const reset = (keys: string[]) => <button type="button" className="design-reset" disabled={keys.every((k) => own[k] === undefined)} onClick={() => onPatch(Object.fromEntries(keys.map((k) => [k, undefined])))} aria-label={L('ডিফল্ট করুন', 'Reset')} title={L('ডিফল্ট মান ব্যবহার করুন', 'Use the default')}><RotateCcw size={12} aria-hidden="true" /></button>

  const number = (key: string, label?: string, unit = 'px') => {
    const field = fieldOf(key) as Extract<Leaf, { kind: 'number' }>
    const id = `${uid}-${key}`
    const hint = device === 'mobile' && desktop[key] !== undefined ? String(desktop[key]) : undefined
    return <div className="design-control" key={key}>
      <div className="design-control__label"><label htmlFor={id}>{label ?? labelOf(field).replace(/ \((px|%)\)$/, '')}</label>{reset([key])}</div>
      <div className="input-affix design-number"><NumericInput id={id} field={field} value={value(key)} placeholder={hint} onChange={(v) => onPatch({ [key]: v }, key)} /><span aria-hidden="true">{unit}</span></div>
    </div>
  }
  const segments = (key: string, label: string, items: { value: string; label: string; icon?: ReactNode }[]) => (
    <div className="design-control" key={key}>
      <div className="design-control__label"><span>{label}</span>{reset([key])}</div>
      <div className="design-segments" role="group" aria-label={label}>
        {items.map((item) => <button key={item.value} type="button" aria-pressed={value(key) === item.value} title={item.label} aria-label={item.label} onClick={() => onPatch({ [key]: value(key) === item.value ? undefined : item.value })}>{item.icon}{item.icon ? null : item.label}</button>)}
      </div>
    </div>
  )
  const select = (key: string, label?: string) => {
    const field = fieldOf(key) as Extract<Leaf, { kind: 'select' }>
    const id = `${uid}-${key}`
    return <div className="design-control" key={key}>
      <div className="design-control__label"><label htmlFor={id}>{label ?? labelOf(field)}</label>{reset([key])}</div>
      <select className="input" id={id} value={String(value(key) ?? '')} onChange={(e) => onPatch({ [key]: e.target.value || undefined })}>
        <option value="">{device === 'mobile' ? L('ডেস্কটপের মতো', 'Same as desktop') : L('ডিফল্ট', 'Default')}</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label[lang === 'bn' ? 0 : 1]}</option>)}
      </select>
    </div>
  }
  const color = (key: string, inherited: string) => <ColorControl key={key} id={`${uid}-${key}`} label={labelOf(fieldOf(key))} value={String(value(key) ?? '')} inherited={String(device === 'mobile' ? desktop[key] ?? inherited : inherited)} onChange={(v, typing) => onPatch({ [key]: v || undefined }, typing ? key : undefined)} />
  const spacing = (kind: 'padding' | 'margin') => {
    const sides = kind === 'padding' ? (['Top', 'Right', 'Bottom', 'Left'] as const) : (['Top', 'Bottom'] as const)
    return <div className="node-spacing" key={kind}>
      <div className="design-control__label"><span>{kind === 'padding' ? L('ভেতরের ফাঁকা (প্যাডিং)', 'Padding') : L('বাইরের ফাঁকা (মার্জিন)', 'Margin')}</span>{reset(sides.map((s) => `${kind}${s}`))}</div>
      <div className="node-spacing__grid" data-count={sides.length}>
        {sides.map((side) => {
          const key = `${kind}${side}`
          const label = L(({ Top: 'উপর', Right: 'ডান', Bottom: 'নিচ', Left: 'বাম' })[side], side)
          return <label key={side} className="node-spacing__cell"><span>{label}</span><span className="input-affix design-number"><NumericInput id={`${uid}-${key}`} field={fieldOf(key) as Extract<Leaf, { kind: 'number' }>} value={value(key)} onChange={(v) => onPatch({ [key]: v }, key)} /></span></label>
        })}
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
      return <Group title={L('সাজানো (ফ্লেক্সবক্স)', 'Arrangement (flexbox)')} icon={<SlidersHorizontal size={15} />}>
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
      </Group>
    })()}
    <Group title={L('বক্সের ভেতরে অবস্থান', 'Position in its box')} icon={<Crosshair size={15} />} open={false}>
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
    <Group title={L('ফাঁকা জায়গা', 'Spacing')} icon={<Square size={15} />}>{spacing('padding')}{spacing('margin')}</Group>
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
      {color('background', node.kind === 'button' ? '#1f7a4d' : '#ffffff')}
      {isBox && <BackgroundImage value={value('backgroundImage')} media={media} label={L('পটভূমির ছবি', 'Background image')} change={L('বদলান', 'Change')} remove={L('সরান', 'Remove')} choose={L('ছবি বেছে নিন', 'Choose image')} onPick={() => onPickImage((id) => onPatch({ backgroundImage: id ?? undefined }))} onRemove={() => onPatch({ backgroundImage: undefined })} />}
    </Group>}
    {!textual && (node.kind === 'icon' || node.kind === 'image') && <Group title={L('অবস্থান', 'Position')} icon={<AlignCenter size={15} />}>
      {segments('textAlign', L('অবস্থান', 'Alignment'), [{ value: 'left', label: L('বামে', 'Left'), icon: <AlignLeft size={16} aria-hidden="true" /> }, { value: 'center', label: L('মাঝে', 'Center'), icon: <AlignCenter size={16} aria-hidden="true" /> }, { value: 'right', label: L('ডানে', 'Right'), icon: <AlignRight size={16} aria-hidden="true" /> }])}
      {node.kind === 'icon' && color('color', '#1f7a4d')}
    </Group>}
    {!textual && <Group title={node.kind === 'button' ? L('বাটনের রং', 'Button colour') : L('পটভূমি', 'Background')} icon={<Palette size={15} />}>
          {color('background', node.kind === 'button' ? '#1f7a4d' : '#ffffff')}
          {isBox && <BackgroundImage value={value('backgroundImage')} media={media} label={L('পটভূমির ছবি', 'Background image')} change={L('বদলান', 'Change')} remove={L('সরান', 'Remove')} choose={L('ছবি বেছে নিন', 'Choose image')} onPick={() => onPickImage((id) => onPatch({ backgroundImage: id ?? undefined }))} onRemove={() => onPatch({ backgroundImage: undefined })} />}
        </Group>}
    <Group title={L('বর্ডার ও কোণা', 'Border & corners')} icon={<Square size={15} />} open={false}>
      <div className="design-grid">{number('radius', L('কোণা', 'Corners'))}{number('borderWidth', L('বর্ডার', 'Border'))}</div>
      {color('borderColor', '#e3e5e1')}
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
export function DeviceSwitch({ device, onChange }: { device: Device; onChange: (d: Device) => void }) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  return <div className="design-segments node-device" role="group" aria-label={L('কোন স্ক্রিনের জন্য', 'Editing for')}>
    <button type="button" aria-pressed={device === 'desktop'} onClick={() => onChange('desktop')}><Monitor size={14} aria-hidden="true" /><span>{L('ডেস্কটপ', 'Desktop')}</span></button>
    <button type="button" aria-pressed={device === 'mobile'} onClick={() => onChange('mobile')}><Smartphone size={14} aria-hidden="true" /><span>{L('মোবাইল', 'Mobile')}</span></button>
  </div>
}

export type { NodeStyle }
