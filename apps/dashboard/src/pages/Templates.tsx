import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { CircleCheck, Copy, Ellipsis, ExternalLink, FileText, Folder, Folders, Home, LayoutGrid, Lock, Package, PanelBottom, PanelTop, Pencil, Plus, Search, ShoppingCart, Star, StarOff, Trash2, TriangleAlert } from 'lucide-react'
import { readyMade, templateTypes, type TemplateType } from 'storefront/site'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Row = { id: string; type: TemplateType; title: string; isDefault: boolean; isPublished: boolean; hasChanges: boolean; updatedAt: string }

export const templateLabels: Record<TemplateType, readonly [string, string]> = {
  header: ['হেডার', 'Header'], footer: ['ফুটার', 'Footer'], home: ['হোম পেজ', 'Home page'], product: ['পণ্যের পেজ', 'Product page'],
  collection: ['কালেকশন পেজ', 'Collection page'], products: ['সব পণ্য', 'All products'], collections: ['সব কালেকশন', 'All collections'],
  page: ['দোকানের পেজ', 'Store page'], cart: ['কার্ট', 'Cart'], search: ['খোঁজার ফল', 'Search results'], notFound: ['পাওয়া যায়নি (404)', 'Not found (404)'],
}
const typeHelp: Record<TemplateType, readonly [string, string]> = {
  header: ['প্রতিটি পেজের ওপরে: লোগো, মেনু, কার্ট।', 'At the top of every page: logo, menu, cart.'],
  footer: ['প্রতিটি পেজের নিচে: লিংক, যোগাযোগ।', 'At the bottom of every page: links, contact.'],
  home: ['দোকানের প্রথম পেজ।', 'The store’s front page.'],
  product: ['প্রতিটি পণ্যের পেজ: ছবি, দাম, অর্ডার।', 'Each product: images, price, order.'],
  collection: ['একটি কালেকশনের পণ্যগুলো।', 'The products of one collection.'],
  products: ['দোকানের সব পণ্যের তালিকা।', 'The list of all products.'],
  collections: ['দোকানের সব কালেকশন।', 'All the store’s collections.'],
  page: ['"আমাদের কথা", নীতি ও অন্য পেজ।', 'About, policies and other pages.'],
  cart: ['কার্ট ও চেকআউট।', 'Cart and checkout.'],
  search: ['খোঁজার পেজ ও ফল।', 'The search page and results.'],
  notFound: ['ভুল লিংকে যা দেখায়।', 'What a wrong link shows.'],
}
const typeIcons: Record<TemplateType, typeof Home> = {
  header: PanelTop, footer: PanelBottom, home: Home, product: Package, collection: Folder, products: LayoutGrid, collections: Folders,
  page: FileText, cart: ShoppingCart, search: Search, notFound: TriangleAlert,
}

// Online store › Templates (like Elementor Pro's Theme Builder): every part of the store is a template made in the page
// builder. Each type has a built-in default (read-only); a published template can replace it as the default, and
// products, collections and store pages can pick another one.
export function Templates() {
  const { t, lang, ago } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const path = useStorePath()
  const navigate = useNavigate()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/templates`
  const canEdit = current.role !== 'staff'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<TemplateType | 'all'>('all')
  const [adding, setAdding] = useState<TemplateType | 'pick' | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<Row[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      if (done) setToast(done)
      await load()
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }
  const open = (id: string) => navigate(path(`/online-store/templates/${id}`))
  const duplicate = (type: TemplateType, title: string, from: string) => act(async () => {
    const made = await api<{ id: string }>(base, { method: 'POST', body: { type, title: L(['কপি: ', 'Copy of ']) + title, from } })
    open(made.id)
  })

  const shown = rows?.filter((r) => tab === 'all' || r.type === tab) ?? []
  // Types still using their built-in template, shown as read-only rows so sellers see what each page uses.
  const builtIns = templateTypes.filter((type) => (tab === 'all' || tab === type) && !rows?.some((r) => r.type === type && r.isDefault))
  const status = (r: Row) => <span className="row template-status">
    {r.isDefault && <Badge tone="success">{L(['ডিফল্ট', 'Default'])}</Badge>}
    {r.isPublished ? <Badge>{L(['প্রকাশিত', 'Published'])}</Badge> : <Badge tone="warning">{L(['খসড়া', 'Draft'])}</Badge>}
    {r.hasChanges && <Badge tone="info">{L(['পরিবর্তন আছে', 'Changed'])}</Badge>}
  </span>

  return (
    <div className="page">
      <PageHeader title={L(['টেমপ্লেট', 'Templates'])} description={L(['দোকানের প্রতিটি অংশ পেজ বিল্ডারে বানানো একটি টেমপ্লেট: হেডার, ফুটার, পণ্যের পেজ, কালেকশন আর আরও।', 'Every part of your store is a template made in the page builder: header, footer, product page, collections and more.'])}
        action={<div className="row">
          <a className="btn" href={storefrontUrl(current.store.handle)} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>
          {canEdit && <Button variant="primary" onClick={() => setAdding('pick')}><Plus size={16} aria-hidden="true" />{L(['নতুন টেমপ্লেট', 'New template'])}</Button>}
        </div>} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{L(['টেমপ্লেট শুধু মালিক ও অ্যাডমিন বদলাতে পারেন।', 'Only owners and admins can change templates.'])}</p>}
      {failed && <section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}

      {!failed && (
        <div className="data-list">
          <div className="filter-bar">
            <nav className="tabs template-tabs" aria-label={L(['টেমপ্লেটের ধরন', 'Template types'])}>
              {(['all', ...templateTypes] as const).map((type) => (
                <button key={type} type="button" className="tab" aria-current={tab === type ? 'page' : undefined} onClick={() => setTab(type)}>
                  {type === 'all' ? L(['সব', 'All']) : L(templateLabels[type])}
                </button>
              ))}
            </nav>
          </div>
          {!rows && <div role="status" aria-label={t('loading')}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton-row"><Skeleton width="16rem" /><Skeleton width="5rem" /></div>)}</div>}
          {rows && (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{L(['নাম', 'Name'])}</th>
                  <th scope="col" className="data-table__meta">{L(['ধরন', 'Type'])}</th>
                  <th scope="col" className="data-table__meta">{L(['অবস্থা', 'Status'])}</th>
                  <th scope="col" className="data-table__meta">{t('pageUpdated')}</th>
                  <th scope="col" className="data-table__meta"><span className="visually-hidden">{L(['কাজ', 'Actions'])}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const Icon = typeIcons[r.type]
                  return (
                    <tr key={r.id} className="data-table__row" onClick={() => open(r.id)}>
                      <td>
                        <Link className="data-table__file" to={path(`/online-store/templates/${r.id}`)} onClick={(e) => e.stopPropagation()}>
                          <span className="data-table__thumb data-table__thumb--icon"><Icon size={16} aria-hidden="true" /></span>
                          <span className="data-table__text"><span className="data-table__name" title={r.title}>{r.title}</span></span>
                        </Link>
                      </td>
                      <td className="data-table__meta">{L(templateLabels[r.type])}</td>
                      <td className="data-table__meta">{status(r)}</td>
                      <td className="data-table__meta muted">{ago(r.updatedAt)}</td>
                      <td className="data-table__meta" onClick={(e) => e.stopPropagation()}>
                        {canEdit && <Dropdown.Root>
                          <Dropdown.Trigger asChild><button type="button" className="btn btn--icon" disabled={busy} aria-label={`${L(['আরও', 'More'])}: ${r.title}`}><Ellipsis size={16} aria-hidden="true" /></button></Dropdown.Trigger>
                          <Dropdown.Portal>
                            <Dropdown.Content className="menu menu--compact" align="end" sideOffset={6} collisionPadding={8}>
                              <Dropdown.Group className="menu__section">
                                <Dropdown.Item className="menu__item menu__action" onSelect={() => open(r.id)}><Pencil size={16} aria-hidden="true" />{L(['এডিট করুন', 'Edit'])}</Dropdown.Item>
                                {r.isDefault
                                  ? <Dropdown.Item className="menu__item menu__action" onSelect={() => void act(() => api(`${base}/${r.id}/default`, { method: 'DELETE' }), L(['বিল্ট-ইন টেমপ্লেট আবার ডিফল্ট।', 'The built-in template is the default again.']))}><StarOff size={16} aria-hidden="true" />{L(['ডিফল্ট থেকে সরান', 'Stop being the default'])}</Dropdown.Item>
                                  : <Dropdown.Item className="menu__item menu__action" disabled={!r.isPublished} onSelect={() => void act(() => api(`${base}/${r.id}/default`, { method: 'POST' }), L(['ডিফল্ট করা হয়েছে।', 'Made the default.']))}><Star size={16} aria-hidden="true" /><span className="menu__text"><span>{L(['ডিফল্ট করুন', 'Make default'])}</span>{!r.isPublished && <span className="menu__sub">{L(['আগে এডিটরে প্রকাশ করুন।', 'Publish it in the editor first.'])}</span>}</span></Dropdown.Item>}
                                <Dropdown.Item className="menu__item menu__action" onSelect={() => void duplicate(r.type, r.title, r.id)}><Copy size={16} aria-hidden="true" />{L(['কপি বানান', 'Duplicate'])}</Dropdown.Item>
                              </Dropdown.Group>
                              <Dropdown.Group className="menu__section menu__section--ruled">
                                <Dropdown.Item className="menu__item menu__action menu__action--danger" onSelect={() => setDeleting(r)}><Trash2 size={16} aria-hidden="true" />{L(['মুছুন', 'Delete'])}</Dropdown.Item>
                              </Dropdown.Group>
                            </Dropdown.Content>
                          </Dropdown.Portal>
                        </Dropdown.Root>}
                      </td>
                    </tr>
                  )
                })}
                {builtIns.map((type) => {
                  const Icon = typeIcons[type]
                  return (
                    <tr key={`builtin-${type}`} className="template-builtin">
                      <td>
                        <span className="data-table__file">
                          <span className="data-table__thumb data-table__thumb--icon"><Icon size={16} aria-hidden="true" /></span>
                          <span className="data-table__text">
                            <span className="data-table__name">{L(['বিল্ট-ইন ', 'Built-in ']) + L(templateLabels[type]).toLowerCase()}</span>
                            <span className="muted data-table__sub"><Lock size={12} aria-hidden="true" /> {L(['বদলানো যায় না; কপি বানিয়ে সাজান।', 'Read-only; duplicate it to make your own.'])}</span>
                          </span>
                        </span>
                      </td>
                      <td className="data-table__meta">{L(templateLabels[type])}</td>
                      <td className="data-table__meta"><span className="row template-status"><Badge tone="success">{L(['ডিফল্ট', 'Default'])}</Badge><Badge>{L(['বিল্ট-ইন', 'Built in'])}</Badge></span></td>
                      <td className="data-table__meta muted">—</td>
                      <td className="data-table__meta">{canEdit && <button type="button" className="btn btn--icon" disabled={busy} aria-label={`${L(['কপি বানিয়ে সাজান', 'Duplicate to edit'])}: ${L(templateLabels[type])}`} title={L(['কপি বানিয়ে সাজান', 'Duplicate to edit'])} onClick={() => void duplicate(type, L(templateLabels[type]), 'builtin')}><Copy size={16} aria-hidden="true" /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {adding && <NewTemplateDialog initial={adding === 'pick' ? null : adding} onClose={() => setAdding(null)} onMade={open} base={base} />}
      {deleting && <DeleteDialog row={deleting} busy={busy} onClose={() => setDeleting(null)} onDelete={async () => { await act(() => api(`${base}/${deleting.id}`, { method: 'DELETE' }), L(['টেমপ্লেট মুছে ফেলা হয়েছে।', 'Template deleted.'])); setDeleting(null) }} />}
      <div className="toast-anchor" role="status">{toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}</div>
    </div>
  )
}

// New template: first what kind (header, product page, …), then a name and where to start from.
function NewTemplateDialog({ initial, base, onClose, onMade }: { initial: TemplateType | null; base: string; onClose: () => void; onMade: (id: string) => void }) {
  const { t, lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const { ref, close, props } = useDialog(onClose)
  const [type, setType] = useState<TemplateType | null>(initial)
  const [title, setTitle] = useState('')
  const [from, setFrom] = useState('builtin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  useEffect(() => {
    if (type) setTimeout(() => ref.current?.querySelector<HTMLInputElement>('#template-new-title')?.focus())
  }, [type])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!type || !title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const made = await api<{ id: string }>(base, { method: 'POST', body: { type, title: title.trim(), from } })
      close(() => onMade(made.id))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  return <dialog {...props} className="modal template-new" aria-labelledby="template-new-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <form onSubmit={(e) => void submit(e)} noValidate>
      <DialogHead id="template-new-heading" title={type ? `${L(['নতুন', 'New'])}: ${L(templateLabels[type])}` : L(['কী ধরনের টেমপ্লেট?', 'What kind of template?'])} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        {!type
          ? <ul className="template-types">
            {templateTypes.map((k) => {
              const Icon = typeIcons[k]
              return <li key={k}><button type="button" onClick={() => setType(k)}><Icon size={22} strokeWidth={1.75} aria-hidden="true" /><strong>{L(templateLabels[k])}</strong><span className="muted">{L(typeHelp[k])}</span></button></li>
            })}
          </ul>
          : <>
            <Field id="template-new-title" label={L(['টেমপ্লেটের নাম', 'Template name'])} maxLength={100} autoComplete="off" placeholder={L(['যেমন: ঈদের হেডার', 'For example: Eid header'])} value={title} onChange={(e) => setTitle(e.target.value)} />
            <fieldset className="choice-list">
              <legend className="field__label">{L(['কোথা থেকে শুরু', 'Start from'])}</legend>
              {[{ id: 'builtin', label: L(['বিল্ট-ইন টেমপ্লেটের কপি', 'A copy of the built-in template']) }, ...(readyMade[type] ?? []).map((r) => ({ id: r.id, label: L(r.label) })), { id: 'blank', label: L(['ফাঁকা', 'Blank']) }].map((o) => (
                <label key={o.id} className="check-line"><input type="radio" className="check" name="template-from" checked={from === o.id} onChange={() => setFrom(o.id)} />{o.label}</label>
              ))}
            </fieldset>
            {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
          </>}
      </div>
      <footer className="dialog__foot dialog__foot--split">
        {type && !initial ? <Button disabled={busy} onClick={() => setType(null)}>{L(['পেছনে', 'Back'])}</Button> : <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>}
        {type && <Button type="submit" variant="primary" disabled={busy || !title.trim()} aria-busy={busy}>{L(['বানান ও সাজান', 'Create and edit'])}</Button>}
      </footer>
    </form>
  </dialog>
}

function DeleteDialog({ row, busy, onClose, onDelete }: { row: Row; busy: boolean; onClose: () => void; onDelete: () => void }) {
  const { t, lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const { ref, close, props } = useDialog(onClose)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog {...props} className="modal" aria-labelledby="template-delete-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <DialogHead id="template-delete-heading" title={L(['টেমপ্লেট মুছবেন?', 'Delete template?'])} disabled={busy} onClose={() => close()} />
    <div className="dialog__body"><p>{L([`"${row.title}" মুছে ফেলা হবে। যে পণ্য, কালেকশন বা পেজ এটি বেছে নিয়েছিল, সেগুলো ডিফল্ট টেমপ্লেটে ফিরবে।`, `"${row.title}" will be deleted. Products, collections or pages that picked it go back to the default template.`])}</p></div>
    <footer className="dialog__foot dialog__foot--split">
      <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
      <Button variant="danger" disabled={busy} aria-busy={busy} onClick={onDelete}>{t('productConfirmDelete')}</Button>
    </footer>
  </dialog>
}
