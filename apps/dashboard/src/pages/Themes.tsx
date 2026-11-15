import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { CircleCheck, ExternalLink, Palette, Plus } from 'lucide-react'
import type { ThemeSettings } from 'storefront/theme'
import { presetIds, presets, type PresetId } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

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
  const duplicate = (theme: Theme) => act(() => api(base, { method: 'POST', body: { name: t('themeCopyName', { value: theme.name }).slice(0, 60), from: theme.id } }))
  const customize = (theme: Theme) => navigate(path(`/online-store/themes/${theme.id}/editor`))

  const live = themes?.find((x) => x.isLive)
  const library = themes?.filter((x) => !x.isLive) ?? []

  const actions = (theme: Theme) => canEdit && (
    <div className="theme-row__actions">
      <Button variant={theme.isLive ? 'primary' : 'default'} onClick={() => customize(theme)}><Palette size={16} aria-hidden="true" />{t('themeCustomize')}</Button>
      {!theme.isLive && <Button disabled={busy || !theme.isPublished} title={theme.isPublished ? undefined : t('themeNotPublishedHelp')} onClick={() => setAsking({ kind: 'live', theme })}>{t('themeMakeLive')}</Button>}
      <Button disabled={busy} onClick={() => void duplicate(theme)}>{t('themeDuplicate')}</Button>
      <Button disabled={busy} onClick={() => setAsking({ kind: 'rename', theme })}>{t('themeRename')}</Button>
      {!theme.isLive && <Button variant="danger" disabled={busy} onClick={() => setAsking({ kind: 'delete', theme })}>{t('themeDelete')}</Button>}
    </div>
  )
  const badges = (theme: Theme) => <>
    {theme.isLive && <Badge tone="success">{t('themesCurrent')}</Badge>}
    {!theme.isPublished && <Badge>{t('themeNotPublished')}</Badge>}
    {theme.hasChanges && <Badge tone="info">{t('themeChanges')}</Badge>}
  </>

  return (
    <div className="page page--narrow">
      <PageHeader title={t('themes')} description={t('themesHelp')} action={<a className="btn" href={storefrontUrl(handle)} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{t('themesManagersOnlyEdit')}</p>}
      {failed && <section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!themes && !failed && <section className="card"><Skeleton /><Skeleton width="60%" /></section>}

      {live && (
        <section className="card theme-live">
          <ThemeSwatch settings={live.settings} storeName={current.store.name} large />
          <div className="theme-live__body">
            <p className="muted">{t('themeLiveTitle')}</p>
            <h2>{live.name}</h2>
            <div className="row">{badges(live)}</div>
            <p className="muted">{t('themeUpdated', { value: ago(live.updatedAt) })}</p>
            {actions(live)}
          </div>
        </section>
      )}

      {themes && (
        <section className="card">
          <div className="card__head">
            <div>
              <h2>{t('themeLibrary')}</h2>
              <p className="muted">{t('themeLibraryHelp')}</p>
            </div>
            {canEdit && <Button onClick={() => setAsking({ kind: 'add' })}><Plus size={16} aria-hidden="true" />{t('themeAdd')}</Button>}
          </div>
          {library.length === 0
            ? <p className="muted">{t('themeLibraryEmpty')}</p>
            : (
              <ul className="theme-rows">
                {library.map((theme) => (
                  <li key={theme.id} className="theme-row">
                    <ThemeSwatch settings={theme.settings} storeName={current.store.name} />
                    <div className="theme-row__body">
                      <strong>{theme.name}</strong>
                      <div className="row">{badges(theme)}<span className="muted">{t('themeUpdated', { value: ago(theme.updatedAt) })}</span></div>
                      {actions(theme)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}

      {asking?.kind === 'add' && <AddThemeDialog busy={busy} onClose={() => setAsking(null)} onAdd={async (name, variation) => {
        if (await act(() => api(base, { method: 'POST', body: { name, variation } }), t('themeSaved', { value: name }))) setAsking(null)
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

// A small drawing of the theme in its own colours (the store's colours, not the dashboard's).
function ThemeSwatch({ settings, storeName, large }: { settings: ThemeSettings; storeName: string; large?: boolean }) {
  const c = settings.colors
  return (
    <div className={large ? 'theme-swatch theme-swatch--large' : 'theme-swatch'} aria-hidden="true" style={{ background: c.paper, color: c.ink, borderColor: c.rule, fontFamily: `"${settings.bangla || 'Hind Siliguri'}", sans-serif` }}>
      <span className="theme-swatch__bar" style={{ borderColor: c.rule }}>{storeName}</span>
      <span className="theme-swatch__cards">{[0, 1, 2].map((i) => <span key={i} style={{ background: c.tint, borderRadius: settings.radius }} />)}</span>
      <span className="theme-swatch__button" style={{ background: c.accent, borderRadius: settings.radius }} />
    </div>
  )
}

function AddThemeDialog({ busy, onClose, onAdd }: { busy: boolean; onClose: () => void; onAdd: (name: string, variation: PresetId) => void }) {
  const { t, lang } = useLang()
  const { ref, close, props } = useDialog(onClose)
  const [name, setName] = useState('')
  const [variation, setVariation] = useState<PresetId>('fresh')
  const [tried, setTried] = useState(false)
  useEffect(() => { ref.current?.showModal() }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (name.trim()) onAdd(name.trim(), variation)
  }
  return <dialog {...props} className="modal" aria-labelledby="add-theme-heading" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <form onSubmit={submit} noValidate>
      <DialogHead id="add-theme-heading" title={t('themeAddTitle')} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        <p className="muted">{t('themeAddHelp')}</p>
        <Field id="theme-new-name" label={t('themeName')} maxLength={60} autoFocus autoComplete="off" value={name} error={tried && !name.trim() ? t('errNameRequired') : undefined} onChange={(e) => setName(e.target.value)} />
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
  useEffect(() => { ref.current?.showModal() }, [])
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
