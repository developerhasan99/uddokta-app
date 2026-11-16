import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CircleCheck, ExternalLink, Trash2 } from 'lucide-react'
import { pageHref } from 'storefront/paths'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { RichText } from '../components/RichText'
import { SeoCard } from '../components/SeoCard'
import { TemplateCard } from '../components/TemplateCard'
import { Badge, Button, Field, Notice, PageTitle, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { storeAddress } from '../product-form'
import { pageState, policyLabels, stateBadge, type PolicyKind } from './StorePages'

type Page = { id: string; title: string; handle: string; body: string; visible: boolean; publishAt: string | null; policy: PolicyKind | null; templateId: string | null; seoTitle: string; seoDescription: string; revision: number }
type Form = Omit<Page, 'id' | 'policy' | 'revision'>
const maxBody = 100_000

// <input type="datetime-local"> works in local time without a zone; the API stores an instant.
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : null)

export function StorePageEdit() {
  const { t } = useLang()
  const { id } = useParams()
  const uid = useId()
  const path = useStorePath()
  const navigate = useNavigate()
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/store-pages`
  const [page, setPage] = useState<Page | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [baseline, setBaseline] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [seoOpen, setSeoOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const show = useCallback((p: Page) => {
    const { id: _, policy: __, revision: ___, ...rest } = p
    const next = { ...rest, publishAt: toLocal(p.publishAt) }
    setPage(p)
    setForm(next)
    setBaseline(JSON.stringify(next))
  }, [])

  const load = useCallback(async () => {
    setFailed(false)
    try {
      show(await api<Page>(`${base}/${id}`))
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

  if (failed) return <div className="page"><section className="card card--flush"><Notice role="alert" title={t('storePageLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!page || !form) return <div className="page" role="status" aria-label={t('loading')}><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const change = (next: Partial<Form>) => {
    setForm({ ...form, ...next })
    setSaved(false)
    if (error === 'pageHandleTaken' && next.handle !== undefined) setError(null)
  }
  const bodyLong = form.body.length > maxBody

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || bodyLong) return setError('productFix')
    setBusy(true)
    setError(null)
    try {
      show(await api<Page>(`${base}/${page.id}`, { method: 'PUT', body: { ...form, publishAt: fromLocal(form.publishAt ?? ''), revision: page.revision } }))
      setSaved(true)
    } catch (err) {
      setError(errorCode(err))
      if (['pageHandleTaken', 'pageHandleReserved'].includes(errorCode(err))) setSeoOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      await api(`${base}/${page.id}`, { method: 'DELETE' })
      navigate(path('/online-store/pages'), { replace: true })
    } catch (err) {
      setConfirming(false)
      setError(errorCode(err))
    }
  }

  const state = pageState({ visible: page.visible, publishAt: page.publishAt })
  const liveUrl = `${storefrontUrl(current.store.handle)}${pageHref(page.handle)}`

  return (
    <form className="page page--detail" onSubmit={(e) => void save(e)} noValidate>
      <PageTitle title={form.title || t('storePageNew')} />
      <header className="detail-head">
        <div className="detail-head__title">
          <Link className="detail-head__back" to={path('/online-store/pages')} aria-label={t('storePageBack')} title={t('storePageBack')}><ArrowLeft size={16} aria-hidden="true" /></Link>
          <h1>{page.title}</h1>
          <Badge tone={stateBadge[state][0]}>{t(stateBadge[state][1])}</Badge>
        </div>
        <div className="detail-head__actions">
          {state === 'visible' && <a className="btn" href={liveUrl} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('storePageView')}</a>}
          {dirty && <Button onClick={() => { setForm(JSON.parse(baseline) as Form); setError(null) }}>{t('productDiscard')}</Button>}
          <Button type="submit" variant="primary" aria-busy={busy} disabled={busy || !dirty}>{t('productSave')}</Button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{t(error === 'productFix' ? 'productFix' : errorLabel(error))}</p>}
      {page.policy && !page.visible && <p className="page-banner" role="note"><strong>{t('storePagePolicyReview')}</strong> {t('storePagePolicyReviewBody')}</p>}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card card--form">
            <Field id="page-title" label={t('storePageTitle')} maxLength={200} autoComplete="off" value={form.title} error={!form.title.trim() ? t('errNameRequired') : undefined} onChange={(e) => change({ title: e.target.value })} />
            <div className="field">
              <span id={`${uid}-body`} className="field__label">{t('storePageContent')}</span>
              <RichText labelledBy={`${uid}-body`} value={form.body} invalid={bodyLong} onChange={(body) => change({ body })} />
              {bodyLong && <p className="field__help field__help--error" role="alert">{t('productDescriptionLong')}</p>}
              {page.policy === 'contact' && <p className="field__help">{t('storePageContactHelp')}</p>}
            </div>
          </section>
          <SeoCard
            section="pages"
            name={form.title}
            description={form.body}
            seoTitle={form.seoTitle}
            seoDescription={form.seoDescription}
            handle={form.handle}
            storeName={current.store.name}
            address={storeAddress(current.store.handle)}
            open={seoOpen}
            handleError={error === 'pageHandleTaken' ? t('errPageHandleTaken') : error === 'pageHandleReserved' ? t('errPageHandleReserved') : undefined}
            onToggle={() => setSeoOpen(!seoOpen)}
            onChange={change}
          />
        </div>

        <aside className="detail-side">
          <section className="card card--form">
            <h2>{t('storePageState')}</h2>
            <fieldset className="choice-list">
              <legend className="visually-hidden">{t('storePageState')}</legend>
              <label className="check-line"><input type="radio" className="check" name="visible" checked={form.visible} onChange={() => change({ visible: true })} />{t('storePageVisible')}</label>
              <label className="check-line"><input type="radio" className="check" name="visible" checked={!form.visible} onChange={() => change({ visible: false })} />{t('storePageHidden')}</label>
            </fieldset>
            {form.visible && (
              <Field id="page-publish-at" type="datetime-local" label={t('storePagePublishAt')} help={t('storePagePublishAtHelp')} value={form.publishAt ?? ''} onChange={(e) => change({ publishAt: e.target.value })} />
            )}
          </section>
          <TemplateCard kind="page" value={form.templateId} onChange={(templateId) => change({ templateId })} />
          {page.policy && (
            <section className="card">
              <h2>{t('storePageKind')}</h2>
              <p>{t(policyLabels[page.policy])}</p>
              <p className="muted">{t('storePagePolicyAddress', { value: `/policies/${page.policy}` })}</p>
            </section>
          )}
          {current.role !== 'staff' && (
            confirming
              ? (
                <section className="card">
                  <p className="muted">{t('storePageDeleteBody', { value: page.title })}</p>
                  <div className="row">
                    <Button onClick={() => setConfirming(false)}>{t('cancel')}</Button>
                    <Button variant="danger" onClick={() => void remove()}>{t('productConfirmDelete')}</Button>
                  </div>
                </section>
              )
              : <button type="button" className="media-details__delete" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />{t('storePageDelete')}</button>
          )}
        </aside>
      </div>
      <div className="toast-anchor" role="status">
        {saved && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('storePageSaved')}</p>}
      </div>
    </form>
  )
}
