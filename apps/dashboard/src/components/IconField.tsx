import { lazy, Suspense, useState } from 'react'
import { ImageUp, Plus, X } from 'lucide-react'
import { iconCatalog, isIconName, mediaIconId } from 'storefront/icons'
import { MarketingIcon } from 'storefront/icon'
import { useLang } from '../i18n'
import { Button, IconButton } from './ui'
import type { MediaItem } from '../api'

const Picker = lazy(() => import('./IconPicker').then((module) => ({ default: module.IconPicker })))

// Shared by standalone fields, buttons, and repeating card/list items.
// value is a library icon name, or media:<id> for the seller's own image (PNG, JPG, SVG … from the media gallery).
// onPickImage opens the media picker (with upload); without it only library icons are offered.
export function IconField({ label, value, onChange, media, onPickImage }: { label: string; value: string; onChange: (value: string) => void; media?: Record<string, MediaItem>; onPickImage?: (apply: (id: string | null) => void) => void }) {
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const chosen = isIconName(value) ? value : ''
  const ownId = mediaIconId(value)
  const own = ownId ? media?.[ownId] : undefined
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  const has = Boolean(chosen || ownId)
  return <div className="field"><span className="field__label">{label}</span><div className="editor-icon-control">
    <span className="editor-icon-control__preview" aria-hidden="true">{chosen ? <MarketingIcon name={chosen} size={28} /> : own ? <img src={own.thumbUrl} alt="" width={28} height={28} /> : <Plus size={20} />}</span>
    <div className="editor-icon-control__name"><strong>{chosen ? iconCatalog[chosen].label[lang === 'bn' ? 0 : 1] : ownId ? L('নিজের ছবি', 'Your image') : L('আইকন নেই', 'No icon')}</strong><small>{chosen || (ownId ? own?.name ?? L('ছবিটি আর নেই', 'Image no longer exists') : L('লাইব্রেরি থেকে বেছে নিন', 'Choose from the library'))}</small></div>
    <Button aria-label={`${has ? L('বদলান', 'Change') : L('বেছে নিন', 'Choose')} ${label}`} onClick={() => setOpen(true)}>{has ? L('বদলান', 'Change') : L('বেছে নিন', 'Choose')}</Button>
    {has && <IconButton label={`${L('মুছুন', 'Remove')} ${label}`} onClick={() => onChange('')}><X size={14} aria-hidden="true" /></IconButton>}
  </div>
  {onPickImage && <button type="button" className="editor-icon-control__own" onClick={() => onPickImage((id) => { if (id) onChange(`media:${id}`) })}><ImageUp size={14} aria-hidden="true" />{L('নিজের আইকন আপলোড করুন (PNG, JPG, SVG)', 'Use your own icon (PNG, JPG, SVG)')}</button>}
  {open && <Suspense fallback={<p className="muted" role="status">{L('আইকন লোড হচ্ছে…', 'Loading icons…')}</p>}><Picker value={chosen} onClose={() => setOpen(false)} onSelect={(icon) => { onChange(icon); setOpen(false) }} /></Suspense>}</div>
}
