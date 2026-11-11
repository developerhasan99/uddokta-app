import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Ban, Blend, Paintbrush, Video, AlignCenter, AlignLeft, AlignRight, ChevronDown, Link2, Unlink2, Monitor, Smartphone, Layers, RotateCcw, Palette, SlidersHorizontal, Type, Square, Image as ImageIcon } from 'lucide-react'
import { styleFieldsFor, type Leaf, type Section, type SectionStyle } from 'storefront/schema'
import { presets, type PresetId } from 'storefront/themes'
import { useLang } from '../i18n'
import type { MediaItem } from '../api'
import { BackgroundImage } from './NodeDesignControls'
import { ColorPicker, isColor, rememberColor } from './ColorPicker'

type Patch = Record<string, string | number | undefined>
type Props = { section: Section; tab: 'layout' | 'style'; theme: PresetId; onPatch: (patch: Patch, typingKey?: string) => void; media: Record<string, MediaItem>; onPickImage: (apply: (id: string | null) => void) => void }
const sides = ['Top', 'Right', 'Bottom', 'Left'] as const

// A titled, collapsible block of settings.
export function Group({ title, icon, children, note, open = true }: { title: string; icon: ReactNode; children: ReactNode; open?: boolean; note?: string }) {
  return <details className="design-group" open={open}>
    <summary><span className="design-group__icon">{icon}</span><strong>{title}</strong><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="design-group__body">{note && <p className="design-help">{note}</p>}{children}</div>
  </details>
}

export function SectionDesignControls({ section, tab, theme, onPatch, media, onPickImage }: Props) {
  const { lang } = useLang()
  const uid = useId()
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  const fields = styleFieldsFor(section.type)
  const values = section.style ?? {}
  const fieldOf = (key: string) => fields.find((f) => f.key === key)
  const labelOf = (field: Leaf) => field.label[lang === 'bn' ? 0 : 1]
  const reset = (key: string) => <button type="button" className="design-reset" disabled={values[key] === undefined} onClick={() => onPatch({ [key]: undefined })} aria-label={`${L('ডিফল্ট করুন', 'Reset')} ${fieldOf(key) ? labelOf(fieldOf(key)!) : key}`} title={L('ডিফল্ট মান ব্যবহার করুন', 'Use inherited value')}><RotateCcw size={12} aria-hidden="true" /></button>

  function control(key: string, label?: string) {
    const field = fieldOf(key)
    if (!field) return null
    const id = `${uid}-${key}`
    return <div className="design-control" key={key}>
      <div className="design-control__label"><label htmlFor={id}>{label ?? labelOf(field).replace(' (px)', '')}</label>{reset(key)}</div>
      {field.kind === 'number' ? <div className="input-affix design-number"><NumericInput id={id} field={field} value={values[key]} onChange={(value) => onPatch({ [key]: value }, key)} />{key.toLowerCase().includes('columns') ? null : <span aria-hidden="true">{key === 'gradientAngle' ? '°' : key === 'overlayOpacity' ? '%' : 'px'}</span>}</div>
        : field.kind === 'select' ? <select className="input" id={id} value={values[key] ?? ''} onChange={(e) => onPatch({ [key]: e.target.value || undefined })}><option value="">{L('ডিফল্ট', 'Inherit')}</option>{field.options.map((o) => <option key={o.value} value={o.value}>{o.label[lang === 'bn' ? 0 : 1]}</option>)}</select> : null}
    </div>
  }

  const themeVars = presets[theme].vars
  const inherited: Record<string, string> = { background: ['features', 'reviews', 'countdown', 'order'].includes(section.type) ? themeVars.tint : themeVars.paper, color: themeVars.ink, accent: themeVars.accent, buttonText: theme === 'night' ? '#141414' : '#ffffff', cardBackground: themeVars.paper, borderColor: themeVars.rule, iconColor: themeVars.accent, iconBackground: themeVars.tint }
  const colorControl = (key: string) => {
    const field = fieldOf(key)
    if (!field) return null
    return <ColorControl key={key} id={`${uid}-${key}`} label={labelOf(field)} value={String(values[key] ?? '')} inherited={inherited[key] ?? ({ gradientFrom: themeVars.accent, gradientTo: themeVars.ink, overlayColor: '#000000' } as Record<string, string>)[key] ?? '#ffffff'} onChange={(v, typing) => onPatch({ [key]: v || undefined }, typing ? key : undefined)} />
  }

  const bgType = String(values.bgType ?? (values.background ? 'color' : 'none'))
  const setType = (type: string) => onPatch(type === 'none' ? { bgType: undefined, background: undefined } : { bgType: type })
  const picker = (key: string, label: string) => <BackgroundImage value={values[key]} media={media} label={label} change={L('বদলান', 'Change')} remove={L('সরান', 'Remove')} choose={L('ছবি বেছে নিন', 'Choose image')} onPick={() => onPickImage((id) => onPatch({ [key]: id ?? undefined }))} onRemove={() => onPatch({ [key]: undefined })} />
  const video = String(values.bgVideo ?? '')
  const videoOk = !video || /^https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?$/i.test(video)

  // Sections are containers: their panel is only size, spacing and visibility (Layout) and background, colours and border (Style).
  return <div className="design-controls">
    {tab === 'layout' ? <>
      <Group title={L('মাপ', 'Size')} icon={<SlidersHorizontal size={15} />}>
        <div className="design-grid">{control('maxWidth', L('কন্টেন্টের প্রস্থ', 'Content width'))}{control('minHeight', L('সর্বনিম্ন উচ্চতা', 'Min height'))}</div>
        <div className="design-segments" role="group" aria-label={L('প্রস্থ বাছাই', 'Width presets')}>{[[680, L('সরু', 'Narrow')], [1080, L('স্বাভাবিক', 'Standard')], [1440, L('চওড়া', 'Wide')], [1600, L('পুরো', 'Full')]].map(([width, label]) => <button type="button" key={width} aria-pressed={values.maxWidth === width} onClick={() => onPatch({ maxWidth: Number(width) })}><span>{label}</span></button>)}</div>
      </Group>
      <Group title={L('ফাঁকা জায়গা', 'Spacing')} icon={<Square size={15} />}>
        <SpacingBox values={values} onPatch={onPatch} />
      </Group>
      <Group title={L('ডিভাইসে দেখানো', 'Device visibility')} icon={<Monitor size={15} />}>
        <div className="design-segments" role="group" aria-label={L('ডিভাইসে দেখানো', 'Device visibility')}>
          {([{ value: 'all', label: L('সব', 'All'), Icon: Layers }, { value: 'desktop', label: L('ডেস্কটপ', 'Desktop'), Icon: Monitor }, { value: 'mobile', label: L('মোবাইল', 'Mobile'), Icon: Smartphone }]).map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={(values.visibility ?? 'all') === value} onClick={() => onPatch({ visibility: value === 'all' ? undefined : value })}><Icon size={14} aria-hidden="true" /><span>{label}</span></button>)}
        </div>
      </Group>
    </> : <>
      <Group title={L('পটভূমি', 'Background')} icon={<Palette size={15} />}>
        {/* One row: the label, then the types as icons (names on hover and for screen readers). */}
        <div className="design-control">
          <div className="design-control__label"><span>{L('পটভূমির ধরন', 'Background type')}</span></div>
          <div className="design-segments design-bg-types" role="group" aria-label={L('পটভূমির ধরন', 'Background type')}>
            {([['none', L('নেই', 'None'), Ban], ['color', L('রং', 'Colour'), Paintbrush], ['gradient', L('গ্রেডিয়েন্ট', 'Gradient'), Blend], ['image', L('ছবি', 'Image'), ImageIcon], ['video', L('ভিডিও', 'Video'), Video]] as const).map(([type, label, Icon]) => <button key={type} type="button" aria-pressed={bgType === type} aria-label={label} title={label} onClick={() => setType(type)}><Icon size={15} aria-hidden="true" /></button>)}
          </div>
        </div>
        {bgType === 'color' && colorControl('background')}
        {bgType === 'gradient' && <>
          <div className="design-control">
            <div className="design-control__label"><span>{L('গ্রেডিয়েন্টের ধরন', 'Gradient type')}</span></div>
            <div className="design-segments" role="group" aria-label={L('গ্রেডিয়েন্টের ধরন', 'Gradient type')}>
              {([['linear', L('সরল', 'Linear')], ['radial', L('গোল', 'Radial')]] as const).map(([type, label]) => <button key={type} type="button" aria-pressed={(values.gradientType ?? 'linear') === type} onClick={() => onPatch({ gradientType: type === 'linear' ? undefined : type })}>{label}</button>)}
            </div>
          </div>
          {colorControl('gradientFrom')}{colorControl('gradientTo')}
          {values.gradientType !== 'radial' && control('gradientAngle', L('কোণ', 'Angle'))}
        </>}
        {bgType === 'image' && <>{picker('bgImage', L('ছবি', 'Image'))}{control('bgSize')}{control('bgPosition')}</>}
        {bgType === 'video' && <>
          <div className="design-control">
            <div className="design-control__label"><label htmlFor={`${uid}-video`}>{L('ভিডিও লিংক', 'Video link')}</label></div>
            <input id={`${uid}-video`} className="input" type="url" placeholder="https://…/video.mp4" value={video} aria-invalid={!videoOk} onChange={(e) => onPatch({ bgVideo: e.target.value.trim() || undefined }, 'bgVideo')} />
          </div>
          <p className={videoOk ? 'design-help' : 'design-help form-error'}>{videoOk ? L('সরাসরি .mp4 বা .webm ফাইলের লিংক দিন। শব্দ ছাড়া, বারবার চলবে। ইউটিউব লিংক এখানে চলবে না।', 'A direct .mp4 or .webm file link. It plays muted and loops. YouTube links do not work here.') : L('লিংকটি https দিয়ে শুরু হয়ে .mp4 বা .webm দিয়ে শেষ হতে হবে।', 'The link must start with https and end in .mp4 or .webm.')}</p>
          {picker('bgImage', L('লোড হওয়ার আগে ছবি', 'Image while loading'))}
        </>}
        {(bgType === 'image' || bgType === 'video') && <>{colorControl('overlayColor')}{control('overlayOpacity', L('ওভারলের গাঢ়ত্ব', 'Overlay strength'))}</>}
      </Group>
      <Group title={L('রং', 'Colours')} icon={<Type size={15} />}>
        {colorControl('color')}{colorControl('accent')}
      </Group>
      <Group title={L('বর্ডার ও কোণা', 'Border & corners')} icon={<Square size={15} />}>
        {control('sectionRadius', L('কোণা', 'Corners'))}{control('borderWidth', L('বর্ডার', 'Border'))}{colorControl('borderColor')}{control('shadow')}
      </Group>
    </>}
  </div>
}

// Keep incomplete typing local so min=320 does not turn the first "6" of "680" into 320.
export function NumericInput({ id, field, value, onChange, placeholder = '—' }: { id: string; field: Extract<Leaf, { kind: 'number' }>; value: string | number | undefined; onChange: (value: number | undefined) => void; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return <input id={id} type="number" min={field.min} max={field.max} step={1} placeholder={placeholder} value={draft ?? value ?? ''} onChange={(e) => {
    const text = e.target.value
    setDraft(text)
    if (text === '') onChange(undefined)
    else { const n = Number(text); if (Number.isInteger(n) && n >= field.min && n <= field.max) onChange(n) }
  }} onBlur={() => {
    if (draft !== null && draft !== '') {
      const n = Math.max(field.min, Math.min(field.max, Math.round(Number(draft) || 0)))
      if (n !== value) onChange(n)
    }
    setDraft(null)
  }} />
}

// One line: label, then a swatch with the HEX code. The swatch opens the colour picker in a popover under it
// (browser popover: closes on an outside click or Escape and is never clipped by the scrolling panel). A small
// pointer on the popover points at the swatch; the colour joins Recent when the popover closes, if it changed.
export function ColorControl({ id, label, value, inherited, onChange }: { id: string; label: string; value: string; inherited: string; onChange: (value: string, typing?: boolean) => void }) {
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const opened = useRef('')
  const pop = useRef<HTMLDivElement>(null)
  const swatch = useRef<HTMLButtonElement>(null)
  const valid = isColor(value)
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  const anchor = `--color-${id.replace(/[^a-z0-9-]/gi, '')}`
  return <div className="design-color" onKeyDown={(e) => { if (open && e.key === 'Escape') e.stopPropagation() }}>
    <div className="design-color__head"><label htmlFor={id}>{label}</label><span>{value ? L('নিজস্ব', 'Custom') : L('থিম', 'Theme')}</span></div>
    <div className="design-color__input" style={{ anchorName: anchor } as CSSProperties}>
      <button type="button" ref={swatch} className="design-color__swatch color-chip" popoverTarget={`${id}-picker`} aria-label={`${label}: ${L('রং বাছাই', 'Choose color')}`}><span style={{ backgroundColor: valid ? value : inherited }} /></button>
      <span className="design-color__hash" aria-hidden="true">#</span><input id={id} type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={8} aria-invalid={!!value && !valid} aria-describedby={value && !valid ? `${id}-error` : undefined} placeholder={inherited.slice(1).toUpperCase()} value={value.replace(/^#/, '').toUpperCase()} onChange={(e) => { const hex = e.target.value.replace(/^#/, ''); onChange(hex ? `#${hex}` : '', true) }} />
      <button type="button" className="design-reset" aria-label={`${L('ডিফল্ট করুন', 'Reset')} ${label}`} title={L('থিমের রং ব্যবহার করুন', 'Use theme color')} disabled={!value} onClick={() => onChange('')}><RotateCcw size={13} aria-hidden="true" /></button>
    </div>
    {value && !valid && <p className="form-error" id={`${id}-error`}>{L('৬ বা ৮ সংখ্যার HEX রং দিন।', 'Enter a six- or eight-digit HEX color.')}</p>}
    <div ref={pop} id={`${id}-picker`} className="color-popover" popover="auto" style={{ positionAnchor: anchor } as CSSProperties} onToggle={(e) => {
      const isOpen = e.newState === 'open'
      setOpen(isOpen)
      if (isOpen) {
        opened.current = value
        // Which side it opened on (it flips above when there is no room) and where the swatch is, for the pointer.
        requestAnimationFrame(() => {
          if (!pop.current || !swatch.current) return
          const p = pop.current.getBoundingClientRect(), sw = swatch.current.getBoundingClientRect()
          pop.current.dataset.side = p.top >= sw.top ? 'below' : 'above'
          pop.current.style.setProperty('--caret-x', `${Math.max(14, Math.min(p.width - 14, sw.left + sw.width / 2 - p.left))}px`)
        })
      } else if (value !== opened.current) rememberColor(value)
    }}>
      {open && <ColorPicker value={value} fallback={inherited} label={label} onChange={onChange} />}
    </div>
  </div>
}

function SpacingBox({ values, onPatch }: { values: SectionStyle; onPatch: Props['onPatch'] }) {
  const { lang } = useLang()
  const uid = useId()
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [linked, setLinked] = useState({ margin: false, padding: false })
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  const keyFor = (kind: 'margin' | 'padding', side: typeof sides[number]) => device === 'mobile' ? `mobile${kind === 'margin' ? 'Margin' : 'Padding'}${side}` : `${kind}${side}`
  function sideInput(kind: 'margin' | 'padding', side: typeof sides[number]) {
    const key = keyFor(kind, side)
    const fallback = kind === 'padding' && (side === 'Left' || side === 'Right') ? (device === 'mobile' ? values[`padding${side}`] ?? values.paddingX : values.paddingX) : undefined
    const sideLabel = L(({ Top: 'উপর', Right: 'ডান', Bottom: 'নিচ', Left: 'বাম' })[side], side.toLowerCase())
    const label = `${device === 'mobile' ? L('মোবাইল', 'Mobile') : L('ডেস্কটপ', 'Desktop')} ${kind === 'margin' ? L('মার্জিন', 'margin') : L('প্যাডিং', 'padding')} ${sideLabel}`
    return <label key={side} className="spacing-side" htmlFor={`${uid}-${key}`}><input id={`${uid}-${key}`} aria-label={label} title={label} type="number" min={0} max={side === 'Top' || side === 'Bottom' ? 300 : 160} step={1} placeholder={fallback !== undefined ? String(fallback) : '—'} value={values[key] ?? ''} onChange={(e) => {
      const value = e.target.value === '' ? undefined : Math.max(0, Math.min(side === 'Top' || side === 'Bottom' ? 300 : 160, Math.round(Number(e.target.value) || 0)))
      const patch = Object.fromEntries((linked[kind] ? sides : [side]).map((s) => [keyFor(kind, s), value]))
      onPatch(patch, `${device}:${kind}:${linked[kind] ? 'all' : side}`)
    }} /><span aria-hidden="true">{L(({ Top: 'উপর', Right: 'ডান', Bottom: 'নিচ', Left: 'বাম' })[side], side)}</span></label>
  }
  const resetBox = (kind: 'margin' | 'padding') => {
    const patch: Patch = Object.fromEntries(sides.map((side) => [keyFor(kind, side), undefined]))
    if (kind === 'padding' && device === 'desktop') patch.paddingX = undefined
    onPatch(patch)
  }
  // Padding, then margin: four joined fields with the side named under each, and a link button at the end that edits all four together.
  const row = (kind: 'padding' | 'margin') => <div className="spacing-row" key={kind}>
    <div className="spacing-row__head">
      <span>{kind === 'padding' ? L('ভেতরের ফাঁকা', 'Padding') : L('বাইরের ফাঁকা', 'Margin')}</span>
      <button type="button" className="design-reset" aria-label={`${kind}: ${L('রিসেট', 'Reset spacing')}`} title={L('রিসেট', 'Reset')} onClick={() => resetBox(kind)}><RotateCcw size={12} aria-hidden="true" /></button>
      <span className="spacing-row__unit" aria-hidden="true">px</span>
    </div>
    <div className="spacing-row__sides">{sides.map((side) => sideInput(kind, side))}
      <button className="spacing-row__link" type="button" aria-pressed={linked[kind]} title={L('সব দিক একসাথে', 'Link all sides')} aria-label={`${kind}: ${L('সব দিক একসাথে বদলান', 'Link all sides')}`} onClick={() => setLinked((s) => ({ ...s, [kind]: !s[kind] }))}>{linked[kind] ? <Link2 size={14} aria-hidden="true" /> : <Unlink2 size={14} aria-hidden="true" />}</button>
    </div>
  </div>
  return <div className="spacing-control">
    <div className="design-segments node-device spacing-devices" role="group" aria-label={L('স্পেসিং ডিভাইস', 'Spacing device')}>
      <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={13} aria-hidden="true" /><span>{L('ডেস্কটপ', 'Desktop')}</span></button><button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone size={13} aria-hidden="true" /><span>{L('মোবাইল', 'Mobile')}</span></button>
    </div>
    {row('padding')}
    {row('margin')}
  </div>
}

