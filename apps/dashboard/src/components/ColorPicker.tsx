import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useLang } from '../i18n'

// A colour is #RRGGBB, or #RRGGBBAA when it is see-through. The storefront schema accepts the same two forms.
export const isColor = (value: string) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)

type Hsva = { h: number; s: number; v: number; a: number }

export function toHsva(hex: string): Hsva {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255
  const [r, g, b] = [n(1), n(3), n(5)]
  const a = hex.length === 9 ? n(7) : 1
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max, a }
}

export function toHex({ h, s, v, a }: Hsva): string {
  const f = (k: number) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)) }
  const byte = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${byte(f(5))}${byte(f(3))}${byte(f(1))}${a < 1 ? byte(a) : ''}`
}

// Recently used colours (one row of 9), newest first, kept in this browser and shared by every picker in the app.
// A colour is added when its picker closes, never while it is being dragged around.
const recentKey = 'uddokta.recent-colors'
export function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey) ?? '[]')
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && isColor(c)).slice(0, 9) : []
  } catch { return [] }
}
export function rememberColor(color: string) {
  if (!isColor(color)) return
  const c = color.toLowerCase()
  try { localStorage.setItem(recentKey, JSON.stringify([c, ...readRecent().filter((x) => x !== c)].slice(0, 9))) } catch { /* storage blocked */ }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

// The picker panel: saturation/brightness area, hue and opacity sliders, and recently used colours.
// onChange runs while dragging (live preview). The caller remembers the final colour when the picker closes.
export function ColorPicker({ value, fallback, label, onChange }: { value: string; fallback: string; label: string; onChange: (color: string, live?: boolean) => void }) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => (lang === 'bn' ? bn : en)
  const current = isColor(value) ? value : isColor(fallback) ? fallback : '#ffffff'
  // Kept here so hue survives greys and black, where the hex alone cannot say it.
  const [hsva, setHsva] = useState(() => toHsva(current))
  const [recent] = useState(readRecent)
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => { if (toHex(hsva) !== current.toLowerCase()) setHsva(toHsva(current)) }, [current])

  const set = (next: Hsva, live = true) => { setHsva(next); onChange(toHex(next), live) }
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = area.current!.getBoundingClientRect()
    set({ ...hsva, s: clamp((e.clientX - box.left) / box.width), v: 1 - clamp((e.clientY - box.top) / box.height) })
  }
  const areaKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01
    const move = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, [number, number]>)[e.key]
    if (!move) return
    e.preventDefault()
    set({ ...hsva, s: clamp(hsva.s + move[0]), v: clamp(hsva.v + move[1]) })
  }
  const solid = toHex({ ...hsva, a: 1 })

  return <div className="color-picker" role="group" aria-label={label}>
    <div ref={area} className="color-picker__area" style={{ backgroundColor: `hsl(${hsva.h} 100% 50%)` }} tabIndex={0} role="slider"
      aria-label={L('রঙের গাঢ়তা ও উজ্জ্বলতা', 'Saturation and brightness')} aria-valuetext={`${Math.round(hsva.s * 100)}%, ${Math.round(hsva.v * 100)}%`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e) }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e) }}
      onKeyDown={areaKeys}>
      <span className="color-picker__thumb" style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, backgroundColor: solid }} />
    </div>
    <input className="color-picker__hue" type="range" min={0} max={359} value={Math.round(hsva.h)} aria-label={L('রং', 'Hue')}
      onChange={(e) => set({ ...hsva, h: Number(e.target.value) })} />
    <input className="color-picker__alpha" type="range" min={0} max={100} value={Math.round(hsva.a * 100)} aria-label={L('স্বচ্ছতা', 'Opacity')} aria-valuetext={`${Math.round(hsva.a * 100)}%`}
      style={{ '--picker-solid': solid } as CSSProperties}
      onChange={(e) => set({ ...hsva, a: Number(e.target.value) / 100 })} />
    <div className="color-picker__recent">
      <span>{L('সম্প্রতি ব্যবহৃত', 'Recent')}</span>
      {recent.length
        ? <div className="color-picker__swatches">{recent.map((c) => <button key={c} type="button" className="color-chip" title={c.toUpperCase()} aria-label={`${label} ${c.toUpperCase()}`} aria-pressed={c === value.toLowerCase()} onClick={() => onChange(c)}><span style={{ backgroundColor: c }} /></button>)}</div>
        : <p>{L('যে রং ব্যবহার করবেন তা এখানে থাকবে।', 'Colours you use will show here.')}</p>}
    </div>
  </div>
}
