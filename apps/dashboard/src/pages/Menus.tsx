import { pageHref } from 'storefront/paths'
import { useEffect, useState } from 'react'
import { ArrowUp, CircleCheck, Plus, X } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { Button, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import type { PageRow } from './Pages'
import type { StoreSettingsData } from './StoreSettings'

type Item = { label: string; href: string }
type Choice = { label: string; href: string }

export function Menus() {
  const { t } = useLang()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const canEdit = current.role !== 'staff'
  const [items, setItems] = useState<Item[] | null>(null)
  const [saved, setSaved] = useState('')
  const [collections, setCollections] = useState<Choice[]>([])
  const [pages, setPages] = useState<Choice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api<StoreSettingsData>(`/stores/${handle}/settings`).then((s) => {
      setItems(s.menu)
      setSaved(JSON.stringify(s.menu))
    }).catch((err) => setError(errorCode(err)))
    api<{ name: string; handle: string }[]>(`/stores/${handle}/collections/options`).then((r) => setCollections(r.map((c) => ({ label: c.name, href: `/collections/${encodeURIComponent(c.handle)}` })))).catch(() => {})
    api<PageRow[]>(`/stores/${handle}/pages`).then((r) => setPages(r.filter((p) => p.isPublished).map((p) => ({ label: p.title, href: pageHref(p.handle) })))).catch(() => {})
  }, [handle])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  const known = [{ label: t('menuHome'), href: '/' }, ...collections, ...pages]
  const isKnown = (href: string) => known.some((k) => k.href === href)
  const change = (i: number, next: Partial<Item>) => setItems((all) => all && all.map((x, j) => (j === i ? { ...x, ...next } : x)))

  const save = async () => {
    if (!items) return
    setError(null)
    try {
      const row = await api<{ menu: Item[] }>(`/stores/${handle}/menu`, { method: 'PUT', body: { items } })
      setItems(row.menu)
      setSaved(JSON.stringify(row.menu))
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    }
  }

  const dirty = items !== null && JSON.stringify(items) !== saved

  return (
    <div className="page page--narrow">
      <PageHeader title={t('menus')} description={t('menuHelp')} action={canEdit ? <Button variant="primary" disabled={!dirty} onClick={() => void save()}>{t('productSave')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!items && !error && <section className="card"><Skeleton /></section>}
      {items && (
        <section className="card">
          {items.length === 0 && <p className="muted">{t('menuEmpty')}</p>}
          <ul className="menu-rows">
            {items.map((item, i) => (
              <li key={i} className="menu-row">
                <input className="input" aria-label={t('menuLabel')} placeholder={t('menuLabel')} maxLength={40} disabled={!canEdit} value={item.label} onChange={(e) => change(i, { label: e.target.value })} />
                <select className="input" aria-label={t('menuLink')} disabled={!canEdit} value={isKnown(item.href) ? item.href : 'custom'} onChange={(e) => {
                  const choice = known.find((k) => k.href === e.target.value)
                  change(i, choice ? { href: choice.href, label: item.label || choice.label } : { href: 'https://' })
                }}>
                  <option value="/">{t('menuHome')}</option>
                  {collections.length > 0 && <optgroup label={t('menuCollections')}>{collections.map((c) => <option key={c.href} value={c.href}>{c.label}</option>)}</optgroup>}
                  {pages.length > 0 && <optgroup label={t('menuPages')}>{pages.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}</optgroup>}
                  <option value="custom">{t('menuCustom')}</option>
                </select>
                {!isKnown(item.href) && <input className="input menu-row__url" aria-label={t('menuCustom')} placeholder={t('menuCustomHint')} maxLength={500} disabled={!canEdit} value={item.href} onChange={(e) => change(i, { href: e.target.value.trim() })} />}
                {canEdit && (
                  <span className="row">
                    <button type="button" className="media__dismiss" disabled={i === 0} aria-label={`${t('pageMoveUp')}: ${item.label}`} onClick={() => setItems((all) => { const next = [...all!]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next })}><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" className="media__dismiss" aria-label={t('menuRemove', { value: item.label })} onClick={() => setItems((all) => all!.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canEdit && items.length < 12 && <div className="row"><Button onClick={() => setItems([...items, { label: '', href: '/' }])}><Plus size={16} aria-hidden="true" />{t('menuAdd')}</Button></div>}
        </section>
      )}
      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('menuSaved')}</p>}
      </div>
    </div>
  )
}
