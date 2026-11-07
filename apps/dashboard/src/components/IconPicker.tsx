import { useEffect, useId, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { iconCatalog, iconCategories, iconNames, isIconName, type IconCategory, type IconName } from 'storefront/icons'
import { MarketingIcon } from 'storefront/icon'
import { useLang } from '../i18n'
import { Button, IconButton } from './ui'
import { useDialog } from './dialog'

type Props = { value: string; onClose: () => void; onSelect: (icon: IconName | '') => void }

export function IconPicker({ value, onClose, onSelect }: Props) {
  const { lang } = useLang()
  const L = (bn: string, en: string) => lang === 'bn' ? bn : en
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const search = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<IconCategory | 'all'>('all')
  const [selected, setSelected] = useState<IconName | ''>(isIconName(value) ? value : '')
  const dismiss = () => close()
  const choose = (icon: IconName | '') => close(() => onSelect(icon))
  const matches = iconNames.filter((id) => {
    const item = iconCatalog[id]
    return (category === 'all' || item.category === category) && `${item.label.join(' ')} ${item.keywords} ${iconCategories[item.category].join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    search.current?.focus()
    return () => { node?.close() }
  }, [])
  return <dialog {...dialogProps} className="modal icon-picker" aria-labelledby={titleId} onClick={(e) => {
    if (e.target !== e.currentTarget) return
    const b = e.currentTarget.getBoundingClientRect()
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dismiss()
  }}>
    <div className="icon-picker__head"><div><h2 id={titleId}>{L('আইকন লাইব্রেরি', 'Icon library')}</h2><p>{L('আপনার পেজের জন্য বাছাই করা ৮০টি আইকন', '80 curated icons for your pages')} <span>· Lucide</span></p></div><IconButton label={L('আইকন লাইব্রেরি বন্ধ করুন', 'Close icon library')} onClick={dismiss}><X size={18} aria-hidden="true" /></IconButton></div>
    <div className="icon-picker__search"><Search size={17} aria-hidden="true" /><input ref={search} type="search" aria-label={L('আইকন খুঁজুন', 'Search icons')} placeholder={L('আইকন খুঁজুন — ডেলিভারি, নগদ, আস্থা…', 'Search icons — delivery, cash, trust…')} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
    <div className="icon-picker__categories" role="group" aria-label={L('আইকনের বিভাগ', 'Icon categories')}>
      <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{L('সব', 'All')} <span>{iconNames.length}</span></button>
      {(Object.keys(iconCategories) as IconCategory[]).map((key) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{iconCategories[key][lang === 'bn' ? 0 : 1]}</button>)}
    </div>
    <div className="icon-picker__results"><p className="icon-picker__count" role="status">{matches.length} {L('টি আইকন', matches.length === 1 ? 'icon' : 'icons')}</p>
      {matches.length ? <div className="icon-picker__grid" role="group" aria-label={L('আইকন বেছে নিন', 'Choose an icon')}>{matches.map((id) => <button key={id} type="button" className="icon-picker__tile" aria-label={iconCatalog[id].label[lang === 'bn' ? 0 : 1]} aria-pressed={selected === id} onClick={() => setSelected(id)}><MarketingIcon name={id} size={28} /><span>{iconCatalog[id].label[lang === 'bn' ? 0 : 1]}</span>{selected === id && <Check size={12} className="icon-picker__selected" aria-hidden="true" />}</button>)}</div>
        : <div className="icon-picker__empty"><Search size={26} aria-hidden="true" /><h3>{L('কোনো আইকন পাওয়া যায়নি', 'No icons found')}</h3><p>{L('অন্য শব্দ লিখুন অথবা অন্য বিভাগ বেছে নিন।', 'Try another word or choose a different category.')}</p><Button onClick={() => { setQuery(''); setCategory('all') }}>{L('সব আইকন দেখুন', 'Show all icons')}</Button></div>}
    </div>
    <div className="icon-picker__foot"><div className="icon-picker__selection">{selected ? <><MarketingIcon name={selected} size={30} /><span><strong>{iconCatalog[selected].label[lang === 'bn' ? 0 : 1]}</strong><small>{selected}</small></span></> : <span>{L('একটি আইকন বেছে নিন', 'Select an icon to continue')}</span>}</div><div className="icon-picker__actions"><Button onClick={() => choose('')}>{L('আইকন ছাড়া', 'No icon')}</Button><Button onClick={dismiss}>{L('বাতিল', 'Cancel')}</Button><Button variant="primary" disabled={!selected} onClick={() => { if (selected) choose(selected) }}>{L('আইকন ব্যবহার করুন', 'Use icon')}</Button></div></div>
  </dialog>
}
