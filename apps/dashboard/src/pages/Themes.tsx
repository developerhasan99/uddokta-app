import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { ChevronDown, CircleCheck, Copy, Download, Ellipsis, ExternalLink, Palette, Pencil, Plus, Radio, Trash2, Upload } from 'lucide-react'
import type { ThemeSettings } from 'storefront/theme'
import { presetIds, presets, type PresetId } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { usePreviewData } from './PageEditor'

type Theme = { id: string; name: string; isLive: boolean; isPublished: boolean; hasChanges: boolean; updatedAt: string; settings: ThemeSettings }
type Asking = { kind: 'add' } | { kind: 'rename' | 'live' | 'delete'; theme: Theme }

export function Themes() {
  const { t, ago } = useLang()
  const path = useStorePath()
  const navigate = useNavigate()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const base = `/stores/${handle}/themes`
  const canEdit = current.role !== 'staff'
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<Asking | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setThemes(await api<Theme[]>(base))
    } catch {
      setFailed(true)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

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
      return true
    } catch (err) {
      setError(errorCode(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  const uploadFile = useRef<HTMLInputElement>(null)
  // A theme file downloads signed; only such unchanged files upload, as a new unpublished theme in the library.
  const download = (theme: Theme) => act(async () => {
    const file = await api(`${base}/${theme.id}/export`)
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `${theme.name.replace(/[^\p{L}\p{N}-]+/gu, '-') || 'theme'}.uddokta-theme.json` })
    link.click()
    URL.revokeObjectURL(url)
  })
  const upload = (file: File) => act(async () => {
    // A file that is not JSON goes up as an empty body, which the API refuses as importInvalid like any other bad file.
    const body: unknown = await file.text().then(JSON.parse).catch(() => ({}))
    await api(`${base}/import`, { method: 'POST', body })
  }, t('themeImported'))
  const duplicate = (theme: Theme) => act(() => api(base, { method: 'POST', body: { name: t('themeCopyName', { value: theme.name }).slice(0, 60), from: theme.id } }))
  const customize = (theme: Theme) => navigate(path(`/online-store/themes/${theme.id}/editor`))

  // The store's own logo, main menu and first products, for the theme pictures.
  const preview = usePreviewData(handle)
  const sample: Sample | null = preview && {
    logo: preview.store.logo?.url ?? null,
    menu: (preview.menus['main-menu'] ?? []).map((m) => m.title),
    products: preview.cards.slice(0, 3).map((x) => ({ name: x.name, price: x.price, image: x.image?.url ?? null })),
  }
  const live = themes?.find((x) => x.isLive)
  const library = themes?.filter((x) => !x.isLive) ?? []

  // One main action (Customize) and the rest in a menu, so each theme reads as one calm row.
  const actions = (theme: Theme) => canEdit && (
    <div className="theme-row__actions">
      <Button variant={theme.isLive ? 'primary' : 'default'} onClick={() => customize(theme)}><Palette size={16} aria-hidden="true" />{t('themeCustomize')}</Button>
      <Dropdown.Root>
        <Dropdown.Trigger asChild><button type="button" className="btn btn--icon" aria-label={t('themeMore', { value: theme.name })} title={t('themeMore', { value: theme.name })} disabled={busy}><Ellipsis size={16} aria-hidden="true" /></button></Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content className="menu menu--compact" align="end" sideOffset={6} collisionPadding={8}>
            <Dropdown.Group className="menu__section">
              {!theme.isLive && <Dropdown.Item className="menu__item menu__action" disabled={!theme.isPublished} onSelect={() => setAsking({ kind: 'live', theme })}><Radio size={16} aria-hidden="true" /><span className="menu__text"><span>{t('themeMakeLive')}</span>{!theme.isPublished && <span className="menu__sub">{t('themeNotPublishedHelp')}</span>}</span></Dropdown.Item>}
              <Dropdown.Item className="menu__item menu__action" onSelect={() => void duplicate(theme)}><Copy size={16} aria-hidden="true" />{t('themeDuplicate')}</Dropdown.Item>
              <Dropdown.Item className="menu__item menu__action" onSelect={() => setAsking({ kind: 'rename', theme })}><Pencil size={16} aria-hidden="true" />{t('themeRename')}</Dropdown.Item>
              <Dropdown.Item className="menu__item menu__action" onSelect={() => void download(theme)}><Download size={16} aria-hidden="true" />{t('themeDownload')}</Dropdown.Item>
            </Dropdown.Group>
            {!theme.isLive && <Dropdown.Group className="menu__section menu__section--ruled">
              <Dropdown.Item className="menu__item menu__action menu__action--danger" onSelect={() => setAsking({ kind: 'delete', theme })}><Trash2 size={16} aria-hidden="true" />{t('themeDelete')}</Dropdown.Item>
            </Dropdown.Group>}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  )
  const meta = (theme: Theme) => <p className="theme-meta">
    {theme.isLive && <Badge tone="success">{t('themesCurrent')}</Badge>}
    {!theme.isPublished && <Badge>{t('themeNotPublished')}</Badge>}
    {theme.hasChanges && <Badge tone="info">{t('themeChanges')}</Badge>}
    <span className="muted">{t('themeUpdated', { value: ago(theme.updatedAt) })}</span>
  </p>
  const addMenu = canEdit && (
    <Dropdown.Root>
      <Dropdown.Trigger asChild><Button variant="primary" disabled={busy}><Plus size={16} aria-hidden="true" />{t('themeAdd')}<ChevronDown size={14} aria-hidden="true" /></Button></Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu menu--compact" align="end" sideOffset={6} collisionPadding={8}>
          <Dropdown.Group className="menu__section">
            <Dropdown.Item className="menu__item menu__action" onSelect={() => setAsking({ kind: 'add' })}><Palette size={16} aria-hidden="true" />{t('themeAddStarter')}</Dropdown.Item>
            <Dropdown.Item className="menu__item menu__action" onSelect={() => uploadFile.current?.click()}><Upload size={16} aria-hidden="true" />{t('themeUpload')}</Dropdown.Item>
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )

  return (
    <div className="page page--narrow">
      <input ref={uploadFile} type="file" accept=".json,application/json" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
      <PageHeader title={t('themes')} description={t('themesHelp')} action={<div className="row">
        <a className="btn" href={storefrontUrl(handle)} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>
        {addMenu}
      </div>} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{t('themesManagersOnlyEdit')}</p>}
      {failed && <section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!themes && !failed && <section className="card"><Skeleton /><Skeleton width="60%" /></section>}

      {live && (
        <section className="card theme-live">
          <ThemeSwatch settings={live.settings} storeName={current.store.name} sample={sample} large />
          <div className="theme-live__body">
            <p className="muted">{t('themeLiveTitle')}</p>
            <h2>{live.name}</h2>
            {meta(live)}
            {actions(live)}
          </div>
        </section>
      )}

      {themes && (
        <section className="card">
          <div className="theme-library__head">
            <h2>{t('themeLibrary')}</h2>
            <p className="muted">{t('themeLibraryHelp')}</p>
          </div>
          {library.length === 0
            ? <p className="muted">{t('themeLibraryEmpty')}</p>
            : (
              <ul className="theme-rows">
                {library.map((theme) => (
                  <li key={theme.id} className="theme-row">
                    <ThemeSwatch settings={theme.settings} storeName={current.store.name} sample={sample} />
                    <div className="theme-row__body">
                      <strong>{theme.name}</strong>
                      {meta(theme)}
                    </div>
                    {actions(theme)}
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}

      {asking?.kind === 'add' && <AddThemeDialog busy={busy} onClose={() => setAsking(null)} onAdd={async (name, variation, design) => {
        if (await act(() => api(base, { method: 'POST', body: { name, variation, design } }), t('themeSaved', { value: name }))) setAsking(null)
      }} />}
      {asking?.kind === 'rename' && <RenameDialog theme={asking.theme} busy={busy} onClose={() => setAsking(null)} onRename={async (name) => {
        const full = await api<{ draft: unknown; revision: number }>(`${base}/${asking.theme.id}`)
        if (await act(() => api(`${base}/${asking.theme.id}`, { method: 'PUT', body: { name, draft: full.draft, revision: full.revision } }), t('themeSaved', { value: name }))) setAsking(null)
      }} />}
      {(asking?.kind === 'live' || asking?.kind === 'delete') && <ConfirmDialog
        title={asking.kind === 'live' ? t('themeMakeLive') : t('themeDelete')}
        body={t(asking.kind === 'live' ? 'themeMakeLiveBody' : 'themeDeleteBody', { value: asking.theme.name })}
        confirm={asking.kind === 'live' ? t('themeMakeLive') : t('productConfirmDelete')}
        danger={asking.kind === 'delete'}
        busy={busy}
        onClose={() => setAsking(null)}
        onConfirm={async () => {
          const ok = asking.kind === 'live'
            ? await act(() => api(`${base}/${asking.theme.id}/live`, { method: 'POST' }), t('themeLiveNow', { value: asking.theme.name }))
            : await act(() => api(`${base}/${asking.theme.id}`, { method: 'DELETE' }))
          if (ok) setAsking(null)
        }}
      />}
      <div className="toast-anchor" role="status">
        {toast && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{toast}</p>}
      </div>
    </div>
  )
}

// A small picture of the theme's home page: the store's logo or name, its main menu and first products, drawn in the
// theme's own colours, fonts and corners (the store's look, not the dashboard's).
type Sample = { logo: string | null; menu: string[]; products: { name: string; price: number; image: string | null }[] }
function ThemeSwatch({ settings, storeName, sample, large }: { settings: ThemeSettings; storeName: string; sample: Sample | null; large?: boolean }) {
  const { money } = useLang()
  const c = settings.colors
  const radius = Math.min(settings.radius, large ? 12 : 8)
  const font = `${settings.latin ? `"${settings.latin}", ` : ''}"${settings.bangla || 'Hind Siliguri'}", sans-serif`
  const products = sample?.products.length ? sample.products : [null, null, null]
  return (
    <div className={large ? 'theme-swatch theme-swatch--large' : 'theme-swatch'} aria-hidden="true" style={{ background: c.paper, color: c.ink, borderColor: c.rule, fontFamily: font }}>
      <span className="theme-swatch__bar" style={{ borderColor: c.rule }}>
        {sample?.logo ? <img src={sample.logo} alt="" /> : <strong>{storeName}</strong>}
        {large && <span className="theme-swatch__menu">{sample?.menu.slice(0, 3).map((m) => <span key={m} style={{ color: c.ink }}>{m}</span>)}</span>}
      </span>
      <span className="theme-swatch__cards">
        {products.slice(0, 3).map((p, i) => (
          <span key={i} className="theme-swatch__card">
            <span className="theme-swatch__image" style={{ background: c.tint, borderRadius: radius }}>{p?.image && <img src={p.image} alt="" />}</span>
            {p && <span className="theme-swatch__name">{p.name}</span>}
            {p && <span className="theme-swatch__price" style={{ color: c.accent }}>{money(p.price)}</span>}
          </span>
        ))}
      </span>
      <span className="theme-swatch__button" style={{ background: c.accent, color: settings.colors.paper, borderRadius: radius }}>{large ? 'এখনই অর্ডার করুন' : ''}</span>
    </div>
  )
}

const designs = [
  { id: 'classic', label: ['ক্লাসিক', 'Classic'], help: ['হোম পেজে সব পণ্যের তালিকা। সহজ ও পরিষ্কার।', 'All products on the home page. Simple and clean.'] },
  { id: 'bazar', label: ['বাজার', 'Bazar'], help: ['ঘোষণা বার, বড় ব্যানার, কালেকশন ও নতুন পণ্য।', 'Announcement bar, a large banner, collections and new arrivals.'] },
] as const

function AddThemeDialog({ busy, onClose, onAdd }: { busy: boolean; onClose: () => void; onAdd: (name: string, variation: PresetId, design: string) => void }) {
  const { t, lang } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [name, setName] = useState('')
  const [variation, setVariation] = useState<PresetId>('fresh')
  const [design, setDesign] = useState<string>('classic')
  const [tried, setTried] = useState(false)
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLInputElement>('#theme-new-name')?.focus() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (name.trim()) onAdd(name.trim(), variation, design)
  }
  return <dialog {...props} className="modal" aria-labelledby="add-theme-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <form onSubmit={submit} noValidate>
      <DialogHead id="add-theme-heading" title={t('themeAddTitle')} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        <p className="muted">{t('themeAddHelp')}</p>
        <Field id="theme-new-name" label={t('themeName')} maxLength={60} autoFocus autoComplete="off" value={name} error={tried && !name.trim() ? t('errNameRequired') : undefined} onChange={(e) => setName(e.target.value)} />
        <fieldset className="choice-list">
          <legend className="field__label">{t('themeDesign')}</legend>
          {designs.map((d) => (
            <label key={d.id} className="switch-row">
              <input type="radio" className="check" name="design" checked={design === d.id} onChange={() => setDesign(d.id)} />
              <span className="switch-row__text"><span className="switch-row__title">{d.label[lang === 'bn' ? 0 : 1]}</span><span className="muted">{d.help[lang === 'bn' ? 0 : 1]}</span></span>
            </label>
          ))}
        </fieldset>
        <fieldset className="choice-list">
          <legend className="field__label">{t('themeStyle')}</legend>
          <div className="theme-styles">
            {presetIds.map((id) => {
              const v = presets[id].vars
              return <button key={id} type="button" className="theme-styles__item" aria-pressed={variation === id} onClick={() => setVariation(id)}><span style={{ background: v.paper, borderColor: v.rule }}><i style={{ background: v.accent }} /></span>{presets[id].label[lang === 'bn' ? 0 : 1]}</button>
            })}
          </div>
        </fieldset>
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('themeCreate')}</Button>
      </footer>
    </form>
  </dialog>
}

function RenameDialog({ theme, busy, onClose, onRename }: { theme: Theme; busy: boolean; onClose: () => void; onRename: (name: string) => void }) {
  const { t } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [name, setName] = useState(theme.name)
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLInputElement>('#theme-rename')?.focus() }, [])
  return <dialog {...props} className="modal" aria-labelledby="rename-theme-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onRename(name.trim()) }} noValidate>
      <DialogHead id="rename-theme-heading" title={t('themeRename')} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        <Field id="theme-rename" label={t('themeName')} maxLength={60} autoFocus autoComplete="off" value={name} error={!name.trim() ? t('errNameRequired') : undefined} onChange={(e) => setName(e.target.value)} />
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy || !name.trim()} aria-busy={busy}>{t('productSave')}</Button>
      </footer>
    </form>
  </dialog>
}

function ConfirmDialog({ title, body, confirm, danger, busy, onClose, onConfirm }: { title: string; body: string; confirm: string; danger?: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useLang()
  const { ref, close, props } = useDialog(onClose)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog {...props} className="modal" aria-labelledby="confirm-theme-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <DialogHead id="confirm-theme-heading" title={title} disabled={busy} onClose={() => close()} />
    <div className="dialog__body"><p>{body}</p></div>
    <footer className="dialog__foot dialog__foot--split">
      <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
      <Button variant={danger ? 'danger' : 'primary'} disabled={busy} aria-busy={busy} onClick={onConfirm}>{confirm}</Button>
    </footer>
  </dialog>
}
