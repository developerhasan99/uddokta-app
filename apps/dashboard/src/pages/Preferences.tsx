import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CircleCheck, ImagePlus } from 'lucide-react'
import { useCurrentStore } from '../account-context'
import { api, errorCode, storefrontUrl, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Prefs = { homeTitle: string; homeDescription: string; shareImage: MediaItem | null; passwordOn: boolean; passwordMessage: string }

// Online store › Preferences: how the home page appears in search and when shared, and an optional password that keeps
// the store closed while it is being prepared (landing pages stay open).
export function Preferences() {
  const { t } = useLang()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/preferences`
  const canEdit = current.role !== 'staff'
  const [form, setForm] = useState<Prefs | null>(null)
  const [saved, setSaved] = useState('')
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [picking, setPicking] = useState(false)

  const show = (p: Prefs) => {
    setForm(p)
    setSaved(JSON.stringify(p))
    setPassword('')
  }
  const load = useCallback(async () => {
    setFailed(false)
    try {
      show(await api<Prefs>(base))
    } catch {
      setFailed(true)
    }
  }, [base])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  if (failed) return <div className="page page--narrow"><section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!form) return <div className="page page--narrow"><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const change = (next: Partial<Prefs>) => setForm({ ...form, ...next })
  const dirty = JSON.stringify(form) !== saved || password !== ''
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      show(await api<Prefs>(base, { method: 'PUT', body: { homeTitle: form.homeTitle, homeDescription: form.homeDescription, shareImageId: form.shareImage?.id ?? null, passwordOn: form.passwordOn, password, passwordMessage: form.passwordMessage } }))
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }
  const wasOn = (JSON.parse(saved) as Prefs).passwordOn

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('preferences')} description={t('preferences.d')} action={canEdit ? <Button type="submit" variant="primary" disabled={busy || !dirty} aria-busy={busy}>{t('productSave')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{t('themesManagersOnlyEdit')}</p>}
      <fieldset className="stack" disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <section className="card card--form">
          <h2>{t('prefHome')}</h2>
          <p className="muted">{t('prefHomeHelp')}</p>
          <Field id="pref-title" label={t('prefHomeTitle')} maxLength={300} placeholder={current.store.name} value={form.homeTitle} onChange={(e) => change({ homeTitle: e.target.value })} />
          <div className="field">
            <label htmlFor="pref-description">{t('prefHomeDescription')}</label>
            <textarea id="pref-description" className="input input--area" rows={3} maxLength={1000} value={form.homeDescription} onChange={(e) => change({ homeDescription: e.target.value })} />
          </div>
          <div className="field">
            <span className="field__label">{t('prefShareImage')}</span>
            {form.shareImage
              ? <div className="collection-image"><img src={form.shareImage.url} alt={form.shareImage.alt || form.shareImage.name} /><div className="row"><Button onClick={() => setPicking(true)}>{t('collectionChangeImage')}</Button><Button onClick={() => change({ shareImage: null })}>{t('collectionRemoveImage')}</Button></div></div>
              : <button type="button" className="media__empty" onClick={() => setPicking(true)}><ImagePlus size={24} strokeWidth={1.5} aria-hidden="true" /><strong>{t('prefSharePick')}</strong><span className="muted">{t('prefShareHelp')}</span></button>}
          </div>
        </section>

        <section className="card card--form">
          <h2>{t('prefPassword')}</h2>
          <label className="switch-row">
            <input type="checkbox" className="check" checked={form.passwordOn} onChange={(e) => change({ passwordOn: e.target.checked })} />
            <span className="switch-row__text">
              <span className="switch-row__title">{t('prefPasswordOn')}</span>
              <span className="muted">{t('prefPasswordHelp')}</span>
            </span>
          </label>
          {form.passwordOn && <>
            <Field id="pref-password" type="password" autoComplete="new-password" maxLength={100} label={wasOn ? t('prefPasswordNew') : t('prefPasswordSet')} help={wasOn ? t('prefPasswordKeep') : t('prefPasswordRule')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Field id="pref-message" label={t('prefPasswordMessage')} maxLength={300} placeholder={t('prefPasswordMessageHint')} value={form.passwordMessage} onChange={(e) => change({ passwordMessage: e.target.value })} />
            <p className="muted"><a href={`${storefrontUrl(current.store.handle)}/password`} target="_blank" rel="noopener">{t('prefPasswordView')}</a></p>
          </>}
        </section>
      </fieldset>
      {picking && <MediaPicker selected={form.shareImage ? [form.shareImage] : []} max={1} onClose={() => setPicking(false)} onDone={(items) => { change({ shareImage: items[0] ?? null }); setPicking(false) }} />}
      <div className="toast-anchor" role="status">{done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('prefSaved')}</p>}</div>
    </form>
  )
}
