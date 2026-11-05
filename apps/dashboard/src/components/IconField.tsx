import { lazy, Suspense, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { iconCatalog, isIconName } from 'storefront/icons'
import { MarketingIcon } from 'storefront/icon'
import { useLang } from '../i18n'
import { Button, IconButton } from './ui'

const Picker = lazy(() => import('./IconPicker').then((module) => ({ default: module.IconPicker })))

// Shared by standalone fields, buttons, and repeating card/list items.
export function IconField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const chosen = isIconName(value) ? value : ''
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  return <div className="field"><span className="field__label">{label}</span><div className="editor-icon-control">
    <span className="editor-icon-control__preview" aria-hidden="true">{chosen ? <MarketingIcon name={chosen} size={28} /> : <Plus size={20} />}</span>
    <div className="editor-icon-control__name"><strong>{chosen ? iconCatalog[chosen].label[lang === 'bn' ? 0 : 1] : L('আইকন নেই', 'No icon')}</strong><small>{chosen || L('লাইব্রেরি থেকে বেছে নিন', 'Choose from the library')}</small></div>
    <Button aria-label={`${chosen ? L('বদলান', 'Change') : L('বেছে নিন', 'Choose')} ${label}`} onClick={() => setOpen(true)}>{chosen ? L('বদলান', 'Change') : L('বেছে নিন', 'Choose')}</Button>
    {chosen && <IconButton label={`${L('মুছুন', 'Remove')} ${label}`} onClick={() => onChange('')}><X size={14} aria-hidden="true" /></IconButton>}
  </div>{open && <Suspense fallback={<p className="muted" role="status">{L('আইকন লোড হচ্ছে…', 'Loading icons…')}</p>}><Picker value={chosen} onClose={() => setOpen(false)} onSelect={(icon) => { onChange(icon); setOpen(false) }} /></Suspense>}</div>
}
