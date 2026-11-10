import { useId, useState, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Link2, Unlink2, Monitor, Smartphone, Layers, RotateCcw, Palette, SlidersHorizontal, Type, Square, Image as ImageIcon } from 'lucide-react'
import { styleFieldsFor, type Leaf, type Section, type SectionStyle } from 'storefront/schema'
import { presets, type PresetId } from 'storefront/themes'
import { useLang } from '../i18n'

type Patch = Record<string, string | number | undefined>
type Props = { section: Section; tab: 'layout' | 'style'; theme: PresetId; onPatch: (patch: Patch, typingKey?: string) => void }
const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
const swatches = ['#ffffff', '#f6f4ee', '#163b2e', '#285a3f', '#e2c86c', '#c34732', '#272b30', '#000000']

// A titled block of settings. Always open: each holds only a few controls.
export function Group({ title, icon, children, note }: { title: string; icon: ReactNode; children: ReactNode; open?: boolean; note?: string }) {
  return <section className="design-group">
    <h3 className="design-group__title"><span className="design-group__icon">{icon}</span><strong>{title}</strong></h3>
    <div className="design-group__body">{note && <p className="design-help">{note}</p>}{children}</div>
  </section>
}

export function SectionDesignControls({ section, tab, theme, onPatch }: Props) {
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
      {field.kind === 'number' ? <div className="input-affix design-number"><NumericInput id={id} field={field} value={values[key]} onChange={(value) => onPatch({ [key]: value }, key)} />{key.toLowerCase().includes('columns') ? null : <span aria-hidden="true">px</span>}</div>
        : field.kind === 'select' ? <select className="input" id={id} value={values[key] ?? ''} onChange={(e) => onPatch({ [key]: e.target.value || undefined })}><option value="">{L('ডিফল্ট', 'Inherit')}</option>{field.options.map((o) => <option key={o.value} value={o.value}>{o.label[lang === 'bn' ? 0 : 1]}</option>)}</select> : null}
    </div>
  }

  const themeVars = presets[theme].vars
  const inherited: Record<string, string> = { background: ['features', 'reviews', 'countdown', 'order'].includes(section.type) ? themeVars.tint : themeVars.paper, color: themeVars.ink, accent: themeVars.accent, buttonText: theme === 'night' ? '#141414' : '#ffffff', cardBackground: themeVars.paper, borderColor: themeVars.rule, iconColor: themeVars.accent, iconBackground: themeVars.tint }
  const colorControl = (key: string) => {
    const field = fieldOf(key)
    if (!field) return null
    return <ColorControl key={key} id={`${uid}-${key}`} label={labelOf(field)} value={String(values[key] ?? '')} inherited={inherited[key]} onChange={(v, typing) => onPatch({ [key]: v || undefined }, typing ? key : undefined)} />
  }

  const alignment = fieldOf('align')
  return <div className="design-controls">
    {tab === 'layout' ? <>
      <Group title={L('আকার ও বিন্যাস', 'Size & arrangement')} icon={<SlidersHorizontal size={15} />}>
        {alignment?.kind === 'select' && <div className="design-control"><div className="design-control__label"><span>{L('লেখার অবস্থান', 'Text alignment')}</span>{reset('align')}</div><div className="design-segments" role="group" aria-label={labelOf(alignment)}>
          {[AlignLeft, AlignCenter, AlignRight].map((Icon, i) => <button key={i} type="button" aria-label={alignment.options[i].label[lang === 'bn' ? 0 : 1]} title={alignment.options[i].label[lang === 'bn' ? 0 : 1]} aria-pressed={values.align === alignment.options[i].value} onClick={() => onPatch({ align: values.align === alignment.options[i].value ? undefined : alignment.options[i].value })}><Icon size={16} aria-hidden="true" /></button>)}
        </div></div>}
        {control('maxWidth', L('কন্টেন্টের প্রস্থ', 'Content width'))}
        <div className="design-widths" role="group" aria-label={L('প্রস্থ বাছাই', 'Width presets')}>{[[680, L('সরু', 'Narrow')], [1080, L('স্বাভাবিক', 'Standard')], [1440, L('চওড়া', 'Wide')]].map(([width, label]) => <button type="button" key={width} aria-pressed={values.maxWidth === width} onClick={() => onPatch({ maxWidth: Number(width) })}>{label}</button>)}</div>
        {fieldOf('columns') && <div className="design-grid">{control('columns', L('ডেস্কটপ কলাম', 'Desktop columns'))}{control('mobileColumns', L('মোবাইল কলাম', 'Mobile columns'))}</div>}
        {control('gap', L('আইটেমের ফাঁক', 'Item gap'))}
      </Group>
      <Group title={L('ফাঁকা জায়গা', 'Spacing')} icon={<Square size={15} />} note={L('বাইরে মার্জিন, ভেতরে প্যাডিং। ফাঁকা মান ডিফল্ট অনুসরণ করে।', 'Margin outside, padding inside. Empty values inherit the defaults.')}>
        <SpacingBox values={values} onPatch={onPatch} />
      </Group>
      <Group title={L('ডিভাইসে দেখানো', 'Device visibility')} icon={<Monitor size={15} />}>
        <div className="design-segments" role="group" aria-label={L('ডিভাইসে দেখানো', 'Device visibility')}>
          {([{ value: 'all', label: L('সব', 'All'), Icon: Layers }, { value: 'desktop', label: L('ডেস্কটপ', 'Desktop'), Icon: Monitor }, { value: 'mobile', label: L('মোবাইল', 'Mobile'), Icon: Smartphone }]).map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={(values.visibility ?? 'all') === value} onClick={() => onPatch({ visibility: value === 'all' ? undefined : value })}><Icon size={14} aria-hidden="true" /><span>{label}</span></button>)}
        </div><p className="design-help">{values.visibility === 'desktop' ? L('মোবাইলে এই সেকশন দেখা যাবে না।', 'This section is hidden on mobile.') : values.visibility === 'mobile' ? L('ডেস্কটপে এই সেকশন দেখা যাবে না।', 'This section is hidden on desktop.') : L('সব স্ক্রিনে এই সেকশন দেখা যাবে।', 'This section appears on every screen.')}</p>
      </Group>
    </> : <>
      <Group title={L('রং', 'Colors')} icon={<Palette size={15} />} note={L('থিমের রং রাখুন, অথবা নিজের রং বাছুন।', 'Keep the theme colors, or choose your own.')}>
        {['background', 'color', 'accent', 'buttonText', 'cardBackground'].map(colorControl)}
      </Group>
      {fieldOf('iconSize') && <Group title={L('আইকন', 'Icons')} icon={<Square size={15} />} open={false}>
        <div className="design-grid">{control('iconSize')}{control('iconStroke')}</div>{control('iconSurface')}{colorControl('iconColor')}{colorControl('iconBackground')}{control('iconRadius')}
      </Group>}
      <Group title={L('টাইপোগ্রাফি', 'Typography')} icon={<Type size={15} />}>
        {control('font')}<div className="design-grid">{control('headingSize', L('শিরোনাম', 'Heading'))}{control('mobileHeadingSize', L('মোবাইল শিরোনাম', 'Mobile heading'))}{control('bodySize', L('মূল লেখা', 'Body text'))}{control('buttonSize', L('বাটনের লেখা', 'Button text'))}</div>{control('headingWeight')}
      </Group>
      <Group title={L('বর্ডার ও কোণা', 'Border & corners')} icon={<Square size={15} />} open={false}>
        <div className="design-grid">{control('borderWidth', L('বর্ডারের প্রস্থ', 'Border width'))}{control('borderStyle')}</div>{colorControl('borderColor')}
        <div className="design-grid">{control('sectionRadius', L('সেকশনের কোণা', 'Section corners'))}{control('radius', L('কার্ড / ছবির কোণা', 'Card / media corners'))}{control('buttonRadius', L('বাটনের কোণা', 'Button corners'))}</div>{control('shadow')}
      </Group>
      {fieldOf('imageFit') && <Group title={L('ছবির সেটিংস', 'Media')} icon={<ImageIcon size={15} />} open={false}>{control('imageFit')}{control('imageRatio')}</Group>}
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

export function ColorControl({ id, label, value, inherited, onChange }: { id: string; label: string; value: string; inherited: string; onChange: (value: string, typing?: boolean) => void }) {
  const { lang } = useLang()
  const valid = /^#[0-9a-f]{6}$/i.test(value)
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  return <div className="design-color">
    <div className="design-color__head"><label htmlFor={id}>{label}</label><span>{value ? L('নিজস্ব', 'Custom') : L('থিম', 'Theme')}</span></div>
    <div className="design-color__input">
      <div className="design-color__swatch" style={{ backgroundColor: valid ? value : inherited }}><input type="color" aria-label={`${label}: ${L('রং বাছাই', 'Choose color')}`} value={valid ? value : inherited} onChange={(e) => onChange(e.target.value)} /></div>
      <span className="design-color__hash" aria-hidden="true">#</span><input id={id} type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={7} aria-invalid={!!value && !valid} aria-describedby={value && !valid ? `${id}-error` : undefined} placeholder={inherited.slice(1).toUpperCase()} value={value.replace(/^#/, '').toUpperCase()} onChange={(e) => { const hex = e.target.value.replace(/^#/, ''); onChange(hex ? `#${hex}` : '', true) }} />
      <button type="button" className="design-reset" aria-label={`${L('ডিফল্ট করুন', 'Reset')} ${label}`} title={L('থিমের রং ব্যবহার করুন', 'Use theme color')} disabled={!value} onClick={() => onChange('')}><RotateCcw size={13} aria-hidden="true" /></button>
    </div>
    {value && !valid && <p className="form-error" id={`${id}-error`}>{L('৬ সংখ্যার HEX রং দিন।', 'Enter a six-digit HEX color.')}</p>}
    <div className="design-palette" role="group" aria-label={`${label}: ${L('রং প্যালেট', 'Color palette')}`}>{swatches.map((color) => <button key={color} type="button" aria-label={`${label} ${color}`} title={color} aria-pressed={value.toLowerCase() === color} style={{ backgroundColor: color }} onClick={() => onChange(color)} />)}</div>
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
    return <label key={side} className={`space-value space-value--${side.toLowerCase()}`} htmlFor={`${uid}-${key}`}><span className="visually-hidden">{label}</span><input id={`${uid}-${key}`} aria-label={label} title={label} type="number" min={0} max={160} step={1} placeholder={fallback !== undefined ? String(fallback) : '—'} value={values[key] ?? ''} onChange={(e) => {
      const value = e.target.value === '' ? undefined : Math.max(0, Math.min(160, Math.round(Number(e.target.value) || 0)))
      const patch = Object.fromEntries((linked[kind] ? sides : [side]).map((s) => [keyFor(kind, s), value]))
      onPatch(patch, `${device}:${kind}:${linked[kind] ? 'all' : side}`)
    }} /></label>
  }
  const resetBox = (kind: 'margin' | 'padding') => {
    const patch: Patch = Object.fromEntries(sides.map((side) => [keyFor(kind, side), undefined]))
    if (kind === 'padding' && device === 'desktop') patch.paddingX = undefined
    onPatch(patch)
  }
  return <div className="spacing-control">
    <div className="design-segments spacing-devices" role="group" aria-label={L('স্পেসিং ডিভাইস', 'Spacing device')}>
      <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={14} aria-hidden="true" />{L('ডেস্কটপ', 'Desktop')}</button><button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone size={14} aria-hidden="true" />{L('মোবাইল', 'Mobile')}</button>
    </div>
    <div className="space-map space-map--margin"><span className="space-map__label">{L('মার্জিন', 'MARGIN')}</span>{sides.map((s) => sideInput('margin', s))}
      <div className="space-map space-map--padding"><span className="space-map__label">{L('প্যাডিং', 'PADDING')}</span>{sides.map((s) => sideInput('padding', s))}<div className="space-map__content" aria-hidden="true"><Square size={14} /></div></div>
    </div>
    <div className="spacing-links">{(['margin', 'padding'] as const).map((kind) => <div key={kind}><button className="spacing-link" type="button" aria-pressed={linked[kind]} aria-label={`${kind}: ${L('সব দিক একসাথে বদলান', 'Link all sides')}`} onClick={() => setLinked((s) => ({ ...s, [kind]: !s[kind] }))}>{linked[kind] ? <Link2 size={13} aria-hidden="true" /> : <Unlink2 size={13} aria-hidden="true" />}<span>{kind === 'margin' ? L('মার্জিন', 'Margin') : L('প্যাডিং', 'Padding')}</span></button><button type="button" className="design-reset" aria-label={`${kind}: ${L('রিসেট', 'Reset spacing')}`} onClick={() => resetBox(kind)}><RotateCcw size={12} aria-hidden="true" /></button></div>)}</div>
    <p className="design-help">{L('px এককে। লিংক চালু করলে চার দিক একসাথে বদলাবে।', 'Values in px. Link sides to edit all four together.')}</p>
  </div>
}
