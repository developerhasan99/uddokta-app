import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CircleCheck, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { idLinkTypes, isPhoneNumber, isWebAddress, linkedIds, maxMenuDepth, type LinkType, type MenuItem, type MenuLinkValue } from 'storefront/menus'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { Badge, Button, Field, Notice, PageTitle, SearchInput, Skeleton } from '../components/ui'
import { errorLabel, useLang, type Key } from '../i18n'
import { append, locate, move, newItemId, nudge, remove, update, type Drop } from '../menu-tree'

type Menu = { id: string; handle: string; title: string; fixed: boolean; items: MenuItem[]; revision: number }
type Form = Pick<Menu, 'title' | 'handle' | 'items'>
// A record a link can point at, as /link-targets returns it.
export type Target = { type: LinkType; id: string; title: string; handle: string; visible: boolean }

const linkLabels: Record<LinkType, Key> = {
  home: 'menuLinkHome', products: 'menuLinkProducts', collections: 'menuLinkCollections', collection: 'menuLinkCollection', product: 'menuLinkProduct',
  page: 'menuLinkPage', storePage: 'menuLinkStorePage', url: 'menuLinkUrl', phone: 'menuLinkPhone', whatsapp: 'menuLinkWhatsapp',
}
// The kinds offered in the picker; store pages join once Pages ships.
const pickable: LinkType[] = ['home', 'products', 'collections', 'collection', 'product', 'page', 'url', 'phone', 'whatsapp']
const needsId = (type: LinkType) => (idLinkTypes as readonly string[]).includes(type)
const needsText = (type: LinkType) => type === 'url' || type === 'phone' || type === 'whatsapp'

export function MenuEdit() {
  const { t } = useLang()
  const { id } = useParams()
  const path = useStorePath()
  const navigate = useNavigate()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}`
  const [menu, setMenu] = useState<Menu | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [baseline, setBaseline] = useState('')
  const [targets, setTargets] = useState<Map<string, Target>>(new Map())
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // The item being edited: an existing id, or a new one going under `parent` (null = top level).
  const [editing, setEditing] = useState<{ id: string } | { parent: string | null } | null>(null)

  const lookUp = useCallback(async (items: MenuItem[]) => {
    const ids = linkedIds(items)
    if (!ids.length) return
    const found = await api<Target[]>(`${base}/link-targets?ids=${ids.join(',')}`).catch(() => [])
    setTargets((all) => new Map([...all, ...found.map((x) => [x.id, x] as const)]))
  }, [base])

  const show = useCallback((m: Menu) => {
    const next = { title: m.title, handle: m.handle, items: m.items }
    setMenu(m)
    setForm(next)
    setBaseline(JSON.stringify(next))
    void lookUp(m.items)
  }, [lookUp])

  const load = useCallback(async () => {
    setFailed(false)
    try {
      show(await api<Menu>(`${base}/menus/${id}`))
    } catch {
      setFailed(true)
    }
  }, [base, id, show])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = form !== null && JSON.stringify(form) !== baseline
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 4000)
    return () => clearTimeout(timer)
  }, [saved])

  if (failed) return <div className="page"><section className="card card--flush"><Notice role="alert" title={t('menuLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!menu || !form) return <div className="page" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const change = (next: Partial<Form>) => {
    setForm({ ...form, ...next })
    setSaved(false)
  }
  const setItems = (items: MenuItem[]) => change({ items })

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return setError('nameRequired')
    setBusy(true)
    setError(null)
    try {
      show(await api<Menu>(`${base}/menus/${menu.id}`, { method: 'PUT', body: { ...form, revision: menu.revision } }))
      setSaved(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const removeMenu = async () => {
    try {
      await api(`${base}/menus/${menu.id}`, { method: 'DELETE' })
      navigate(path('/online-store/menus'), { replace: true })
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  const editingItem = editing && 'id' in editing ? locate(form.items, editing.id) : null

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <PageTitle title={form.title || t('menus')} />
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/online-store/menus')} aria-label={t('menuBack')} title={t('menuBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{menu.title}</h1>
          {menu.fixed && <Badge>{t('menuFixedBadge')}</Badge>}
        </div>
        <div className="detail-head__actions">
          {dirty && <Button onClick={() => { setForm(JSON.parse(baseline) as Form); setError(null) }}>{t('productDiscard')}</Button>}
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy || !dirty}>{t('productSave')}</Button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card">
            <div className="card__head">
              <div>
                <h2>{t('menuItems')}</h2>
                {form.items.length > 0 && <p className="muted">{t('menuDragHelp')}</p>}
              </div>
              {form.items.length > 0 && <Button onClick={() => setEditing({ parent: null })}><Plus size={16} aria-hidden="true" />{t('menuAddItem')}</Button>}
            </div>
            {form.items.length === 0
              ? (
                <button type="button" className="media__empty" onClick={() => setEditing({ parent: null })}>
                  <Plus size={24} strokeWidth={1.5} aria-hidden="true" />
                  <strong>{t('menuAddItem')}</strong>
                  <span className="muted">{t(menu.handle === 'main-menu' ? 'menuMainEmpty' : 'menuItemsEmpty')}</span>
                </button>
              )
              : <MenuTree items={form.items} targets={targets} onChange={setItems} onEdit={(itemId) => setEditing({ id: itemId })} onAddChild={(parent) => setEditing({ parent })} />}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card card--form">
            <Field id="menu-title" label={t('menuTitle')} maxLength={60} autoComplete="off" value={form.title} error={!form.title.trim() ? t('errNameRequired') : undefined} onChange={(e) => change({ title: e.target.value })} />
            <Field id="menu-handle" label={t('menuHandle')} maxLength={60} autoComplete="off" spellCheck={false} disabled={menu.fixed} help={t(menu.fixed ? 'menuHandleFixed' : 'menuHandleHelp')} value={form.handle} onChange={(e) => change({ handle: e.target.value.toLowerCase() })} />
          </section>
          {!menu.fixed && current.role !== 'staff' && (
            confirming
              ? (
                <section className="card">
                  <p className="muted">{t('menuDeleteBody', { value: menu.title })}</p>
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" onClick={() => void removeMenu()}>{t('productConfirmDelete')}</Button>
                  </div>
                </section>
              )
              : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />{t('menuDelete')}</button>
          )}
        </aside>
      </div>

      {editing && (
        <ItemDialog
          item={editingItem ? editingItem.siblings[editingItem.index] : null}
          base={base}
          onClose={() => setEditing(null)}
          onDone={(item, target) => {
            if (target) setTargets((all) => new Map(all).set(target.id, target))
            setItems('id' in editing ? update(form.items, editing.id, (old) => ({ ...old, title: item.title, link: item.link })) : append(form.items, editing.parent, item))
            setEditing(null)
          }}
        />
      )}
      <div className="toast-anchor" role="status">
        {saved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('menuSaved')}</p>}
      </div>
    </form>
  )
}

// What a row says about its link: the kind, and the record's name for id links.
function useLinkText() {
  const { t } = useLang()
  return (link: MenuLinkValue, targets: Map<string, Target>) => {
    if (needsId(link.type)) return `${t(linkLabels[link.type])}: ${targets.get(link.id!)?.title ?? '…'}`
    if (needsText(link.type)) return `${t(linkLabels[link.type])}: ${link.url}`
    return t(linkLabels[link.type])
  }
}

function MenuTree({ items, targets, onChange, onEdit, onAddChild }: { items: MenuItem[]; targets: Map<string, Target>; onChange: (items: MenuItem[]) => void; onEdit: (id: string) => void; onAddChild: (parent: string) => void }) {
  const { t } = useLang()
  const linkText = useLinkText()
  const dragging = useRef<string | null>(null)
  const [hint, setHint] = useState<{ id: string; where: Drop } | null>(null)
  const list = useRef<HTMLUListElement>(null)

  // Top and bottom quarters drop beside the row; the middle drops inside it.
  const whereIn = (e: DragEvent<HTMLElement>): Drop => {
    const box = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - box.top) / box.height
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'
  }
  const keepFocus = (id: string) => requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus())
  const onKey = (e: KeyboardEvent, id: string) => {
    const key = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' } as const)[e.key as 'ArrowUp']
    if (!key) return
    e.preventDefault()
    const next = nudge(items, id, key)
    if (next !== items) {
      onChange(next)
      keepFocus(id)
    }
  }

  const rows = (level: MenuItem[], depth: number) => level.map((item) => {
    const target = item.link.id ? targets.get(item.link.id) : undefined
    const broken = needsId(item.link.type) && targets.size > 0 && (!target || !target.visible)
    return (
      <li key={item.id}>
        <div
          className={`menu-item${hint?.id === item.id ? ` menu-item--drop-${hint.where}` : ''}`}
          style={{ '--depth': depth - 1 } as CSSProperties}
          onDragOver={(e) => {
            if (!dragging.current || dragging.current === item.id) return
            e.preventDefault()
            const where = whereIn(e)
            if (hint?.id !== item.id || hint.where !== where) setHint({ id: item.id, where })
          }}
          onDragLeave={() => setHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            if (dragging.current) onChange(move(items, dragging.current, item.id, whereIn(e)))
            dragging.current = null
            setHint(null)
          }}
        >
          <button
            type="button"
            className="menu-item__grip"
            data-grip={item.id}
            draggable
            aria-label={t('menuDragHandle', { value: item.title })}
            title={t('menuDragHandle', { value: item.title })}
            onDragStart={(e) => { dragging.current = item.id; e.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => { dragging.current = null; setHint(null) }}
            onKeyDown={(e) => onKey(e, item.id)}
          ><GripVertical size={16} aria-hidden="true" /></button>
          <button type="button" className="menu-item__main" onClick={() => onEdit(item.id)}>
            <span className="menu-item__title">{item.title}</span>
            <span className="menu-item__link muted">{linkText(item.link, targets)}</span>
          </button>
          {broken && <span title={t('menuBrokenHelp')}><Badge tone="warning">{t('menuBroken')}</Badge></span>}
          <span className="menu-item__actions">
            <button type="button" className="media__dismiss" aria-label={t('menuEditItem', { value: item.title })} title={t('menuEditItem', { value: item.title })} onClick={() => onEdit(item.id)}><Pencil size={16} aria-hidden="true" /></button>
            {depth < maxMenuDepth && <button type="button" className="media__dismiss" aria-label={t('menuAddChild', { value: item.title })} title={t('menuAddChild', { value: item.title })} onClick={() => onAddChild(item.id)}><Plus size={16} aria-hidden="true" /></button>}
            <button type="button" className="media__dismiss" aria-label={t('menuDeleteItem', { value: item.title })} title={t('menuDeleteItem', { value: item.title })} onClick={() => onChange(remove(items, item.id))}><X size={16} aria-hidden="true" /></button>
          </span>
        </div>
        {item.children.length > 0 && <ul className="menu-tree">{rows(item.children, depth + 1)}</ul>}
      </li>
    )
  })

  return <ul ref={list} className="menu-tree menu-tree--root">{rows(items, 1)}</ul>
}

// Add or edit one item: its label and where it links. Searching finds collections, products and landing pages by name.
function ItemDialog({ item, base, onClose, onDone }: { item: MenuItem | null; base: string; onClose: () => void; onDone: (item: MenuItem, target: Target | null) => void }) {
  const { t } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [title, setTitle] = useState(item?.title ?? '')
  const [type, setType] = useState<LinkType>(item?.link.type ?? 'home')
  const [text, setText] = useState(item?.link.url ?? '')
  const [picked, setPicked] = useState<Target | null>(null)
  const [pickedId, setPickedId] = useState(item?.link.id ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Target[] | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  useEffect(() => {
    if (!needsId(type)) return
    let live = true
    const timer = setTimeout(() => {
      api<Target[]>(`${base}/link-targets?q=${encodeURIComponent(query)}`).then((all) => { if (live) setResults(all.filter((x) => x.type === type)) }).catch(() => { if (live) setResults([]) })
    }, query ? 250 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [base, type, query])

  const textError = type === 'url' ? !isWebAddress(text.trim()) && 'menuUrlInvalid' : (type === 'phone' || type === 'whatsapp') ? !isPhoneNumber(text.trim()) && 'menuPhoneInvalid' : false
  const linkError = needsId(type) ? !pickedId && 'menuLinkRequired' : textError

  const done = () => {
    setTried(true)
    const label = title.trim() || picked?.title || (!needsId(type) && !needsText(type) ? t(linkLabels[type]) : '')
    if (!label || linkError) return
    const link: MenuLinkValue = needsId(type) ? { type, id: pickedId } : needsText(type) ? { type, url: text.trim() } : { type }
    close(() => onDone({ id: item?.id ?? newItemId(), title: label.slice(0, 60), link, children: item?.children ?? [] }, picked))
  }

  return (
    <dialog {...props} className="modal menu-item-dialog" aria-labelledby="menu-item-heading">
      <DialogHead id="menu-item-heading" title={item ? t('menuEditItem', { value: item.title }) : t('menuItemNew')} onClose={() => close()} />
      <div className="dialog__body">
        <Field id="menu-item-title" label={t('menuItemName')} maxLength={60} autoComplete="off" value={title} placeholder={picked?.title} error={tried && !title.trim() && !picked && (needsId(type) || needsText(type)) ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />
        <div className="field">
          <label className="field__label" htmlFor="menu-item-type">{t('menuItemLink')}</label>
          <select id="menu-item-type" className="input" value={type} onChange={(e) => { setType(e.target.value as LinkType); setPickedId(''); setPicked(null); setResults(null); setQuery('') }}>
            {pickable.map((x) => <option key={x} value={x}>{t(linkLabels[x])}</option>)}
          </select>
        </div>
        {needsText(type) && (
          <Field id="menu-item-text" label={t(linkLabels[type])} autoComplete="off" spellCheck={false} inputMode={type === 'url' ? 'url' : 'tel'} placeholder={t(type === 'url' ? 'menuUrlHint' : 'menuPhoneHint')} value={text} error={tried && textError ? t(textError) : undefined} onChange={(e) => setText(e.target.value)} />
        )}
        {needsId(type) && (
          <div className="menu-pick">
            <SearchInput label={t('menuLinkSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="dialog-list menu-pick__list" role="radiogroup" aria-label={t('menuLinkChoose')}>
              {results === null && <Skeleton />}
              {results?.length === 0 && <p className="muted menu-pick__none">{t('menuLinkNone')}</p>}
              {results?.map((x) => (
                <label key={x.id} className="picker-row">
                  <input type="radio" name="menu-target" checked={pickedId === x.id} onChange={() => { setPickedId(x.id); setPicked(x) }} />
                  <span className="picker-row__name">{x.title}</span>
                  {!x.visible && <Badge>{t('menuLinkHidden')}</Badge>}
                </label>
              ))}
            </div>
            {tried && linkError && <p className="field__help field__help--error" role="alert">{t(linkError)}</p>}
          </div>
        )}
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button onClick={() => close()}>{t('cancel')}</Button>
        <Button variant="primary" onClick={done}>{t('menuItemDone')}</Button>
      </footer>
    </dialog>
  )
}

