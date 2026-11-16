import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CircleCheck, ExternalLink, FileText, ImagePlus, LayoutTemplate, ListTree, Lock } from 'lucide-react'
import { styleFromPreset, type SiteColors, type SiteStyle } from 'storefront/site'
import { pageFonts, presetIds, presets } from 'storefront/themes'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { ColorControl } from '../components/SectionDesignControls'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

const CssEditor = lazy(() => import('../components/CssEditor'))

type Prefs = { homeTitle: string; homeDescription: string; shareImage: MediaItem | null; passwordOn: boolean; passwordMessage: string }
type Counts = { templates: number; pages: number; menus: number; broken: number }

// Online store: the store's address and parts (templates, pages, menus), its look (Site settings) and its preferences
// (home page in search and sharing, password) on one screen with one Save.
export function OnlineStore() {
  const { t, lang, num } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const path = useStorePath()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const url = storefrontUrl(handle)
  const canEdit = current.role !== 'staff'
  const [style, setStyle] = useState<SiteStyle | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saved, setSaved] = useState({ style: '', prefs: '' })
  const [password, setPassword] = useState('')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [picking, setPicking] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [s, p] = await Promise.all([api<SiteStyle>(`/stores/${handle}/site-style`), api<Prefs>(`/stores/${handle}/preferences`)])
      setStyle(s)
      setPrefs(p)
      setSaved({ style: JSON.stringify(s), prefs: JSON.stringify(p) })
      setPassword('')
    } catch {
      setFailed(true)
    }
    Promise.all([
      api<unknown[]>(`/stores/${handle}/templates`).catch(() => []),
      api<unknown[]>(`/stores/${handle}/store-pages`).catch(() => []),
      api<{ broken: number }[]>(`/stores/${handle}/menus`).catch(() => []),
    ]).then(([tpl, pages, menus]) => setCounts({ templates: tpl.length, pages: pages.length, menus: menus.length, broken: menus.reduce((n, m) => n + m.broken, 0) }))
  }, [handle])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  if (failed) return <div className="page page--narrow"><section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!style || !prefs) return <div className="page page--narrow"><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const styleDirty = JSON.stringify(style) !== saved.style
  const prefsDirty = JSON.stringify(prefs) !== saved.prefs || password !== ''
  const setS = (next: Partial<SiteStyle>) => setStyle({ ...style, ...next })
  const setP = (next: Partial<Prefs>) => setPrefs({ ...prefs, ...next })
  const wasLocked = (JSON.parse(saved.prefs) as Prefs).passwordOn

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const nextStyle = styleDirty ? await api<SiteStyle>(`/stores/${handle}/site-style`, { method: 'PUT', body: style }) : style
      const nextPrefs = prefsDirty ? await api<Prefs>(`/stores/${handle}/preferences`, { method: 'PUT', body: { homeTitle: prefs.homeTitle, homeDescription: prefs.homeDescription, shareImageId: prefs.shareImage?.id ?? null, passwordOn: prefs.passwordOn, password, passwordMessage: prefs.passwordMessage } }) : prefs
      setStyle(nextStyle)
      setPrefs(nextPrefs)
      setSaved({ style: JSON.stringify(nextStyle), prefs: JSON.stringify(nextPrefs) })
      setPassword('')
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const c = style.colors
  const colorLabels: Record<keyof SiteColors, readonly [string, string]> = {
    accent: ['মূল রং', 'Main'], ink: ['লেখা', 'Text'], paper: ['পটভূমি', 'Background'], tint: ['হালকা পটভূমি', 'Soft background'], rule: ['রেখা', 'Lines'],
  }
  const part = (to: string, Icon: typeof FileText, title: string, sub: string, badge?: ReactNode) => (
    <Link className="store-part" to={path(to)}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="store-part__text"><strong>{title}{badge}</strong><span className="muted">{sub}</span></span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  )
  const section = (title: string, help: string, children: ReactNode) => (
    <section className="settings-split">
      <div className="settings-split__head"><h2>{title}</h2><p className="muted">{help}</p></div>
      <div className="card card--form settings-split__body">{children}</div>
    </section>
  )

  return (
    <form className="page page--settings" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('onlineStore')} description={t('onlineStore.d')} action={<div className="row">
        <a className="btn" href={url} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>
        {canEdit && <Button type="submit" variant="primary" disabled={busy || (!styleDirty && !prefsDirty)} aria-busy={busy}>{t('productSave')}</Button>}
      </div>} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{L(['এখানের সেটিংস শুধু মালিক ও অ্যাডমিন বদলাতে পারেন।', 'Only owners and admins can change these settings.'])}</p>}

      <section className="card store-overview">
        <div className="store-overview__address">
          <span className="muted">{t('storeAddressTitle')}</span>
          <a href={url} target="_blank" rel="noopener">{url.replace(/^https?:\/\//, '')}</a>
          {wasLocked && <Badge tone="warning"><Lock size={11} aria-hidden="true" /> {L(['পাসওয়ার্ড দিয়ে বন্ধ', 'Password protected'])}</Badge>}
        </div>
        <div className="store-parts">
          {part('/online-store/templates', LayoutTemplate, t('templates'), counts ? L([`${num(counts.templates)}টি নিজের টেমপ্লেট`, `${num(counts.templates)} of your own`]) : '…')}
          {part('/online-store/pages', FileText, t('pages'), counts ? L([`${num(counts.pages)}টি পেজ`, `${num(counts.pages)} pages`]) : '…')}
          {part('/online-store/menus', ListTree, t('menus'), counts ? L([`${num(counts.menus)}টি মেনু`, `${num(counts.menus)} menus`]) : '…', counts && counts.broken > 0 ? <Badge tone="warning">{t('menuBrokenCount', { n: num(counts.broken) })}</Badge> : undefined)}
        </div>
      </section>

      <fieldset className="settings-stack" disabled={!canEdit}>
        {section(L(['চেহারা', 'Look']), L(['পুরো দোকান আর সব ল্যান্ডিং পেজের রং, ফন্ট ও আকার।', 'Colours, fonts and sizes for the whole store and every landing page.']), <>
          <div className="look-presets" role="group" aria-label={L(['এক ক্লিকে স্টাইল', 'One-click style'])}>
            {presetIds.map((id) => {
              const v = presets[id].vars
              const on = v.accent === c.accent && v.paper === c.paper
              return <button key={id} type="button" className="look-preset" aria-pressed={on} title={presets[id].label[lang === 'bn' ? 0 : 1]} onClick={() => setS({ ...styleFromPreset(id), latin: style.latin, width: style.width, css: style.css })}>
                <span style={{ background: v.paper, borderColor: v.rule }}><i style={{ background: v.accent }} /></span>{presets[id].label[lang === 'bn' ? 0 : 1]}
              </button>
            })}
          </div>
          <div className="look-colors">
            {(Object.keys(colorLabels) as (keyof SiteColors)[]).map((key) => (
              <ColorControl key={key} id={`site-color-${key}`} label={L(colorLabels[key])} value={c[key]} inherited="" onChange={(value) => { if (/^#[0-9a-f]{6}$/i.test(value)) setS({ colors: { ...c, [key]: value.toLowerCase() } }) }} />
            ))}
          </div>
          <div className="price-grid price-grid--two">
            {(['bangla', 'latin'] as const).map((kind) => <div key={kind} className="field">
              <label htmlFor={`site-font-${kind}`}>{kind === 'bangla' ? L(['বাংলা ফন্ট', 'Bangla font']) : L(['ইংরেজি ফন্ট', 'English font'])}</label>
              <select className="input" id={`site-font-${kind}`} value={style[kind]} onChange={(e) => setS({ [kind]: e.target.value })}>
                <option value="">{L(['সাধারণ', 'Default'])}</option>
                {Object.keys(pageFonts[kind]).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>)}
            <Field id="site-radius" type="number" label={L(['কোণের গোলভাব (px)', 'Corner roundness (px)'])} min={0} max={32} value={String(style.radius)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (n >= 0 && n <= 32) setS({ radius: n }) }} />
            <Field id="site-width" type="number" label={L(['কন্টেন্টের প্রস্থ (px)', 'Content width (px)'])} min={720} max={1600} step={20} value={String(style.width)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (n >= 720 && n <= 1600) setS({ width: n }) }} />
          </div>
          <details className="look-css" open={style.css !== '' || undefined}>
            <summary>{L(['কাস্টম CSS', 'Custom CSS'])}</summary>
            <Suspense fallback={<div className="css-editor css-editor--loading" />}>
              <CssEditor value={style.css} label={L(['পুরো সাইটের কাস্টম CSS', 'Custom CSS for the whole site'])} describedBy="site-css-help" maxLength={20000} onChange={(css) => setS({ css })} />
            </Suspense>
            {style.css.includes('<')
              ? <p className="field__help field__help--error" role="alert">{L(['CSS-এ < চিহ্ন রাখা যাবে না।', 'CSS cannot contain the < character.'])}</p>
              : <p className="field__help" id="site-css-help">{L(['দোকানের সব পেজ ও ল্যান্ডিং পেজে কাজ করে।', 'Applies to every store page and landing page.'])}</p>}
          </details>
        </>)}

        {section(t('prefHome'), t('prefHomeHelp'), <>
          <Field id="pref-title" label={t('prefHomeTitle')} maxLength={300} placeholder={current.store.name} value={prefs.homeTitle} onChange={(e) => setP({ homeTitle: e.target.value })} />
          <div className="field">
            <label htmlFor="pref-description">{t('prefHomeDescription')}</label>
            <textarea id="pref-description" className="input input--area" rows={2} maxLength={1000} value={prefs.homeDescription} onChange={(e) => setP({ homeDescription: e.target.value })} />
          </div>
          <div className="share-image">
            {prefs.shareImage
              ? <img src={prefs.shareImage.url} alt={prefs.shareImage.alt || prefs.shareImage.name} />
              : <span className="share-image__empty"><ImagePlus size={18} strokeWidth={1.5} aria-hidden="true" /></span>}
            <span className="share-image__text"><strong>{t('prefShareImage')}</strong><span className="muted">{t('prefShareHelp')}</span></span>
            <span className="row">
              <Button onClick={() => setPicking(true)}>{prefs.shareImage ? t('collectionChangeImage') : t('prefSharePick')}</Button>
              {prefs.shareImage && <Button onClick={() => setP({ shareImage: null })}>{t('collectionRemoveImage')}</Button>}
            </span>
          </div>
        </>)}

        {section(t('prefPassword'), t('prefPasswordHelp'), <>
          <label className="check-line"><input type="checkbox" className="check" checked={prefs.passwordOn} onChange={(e) => setP({ passwordOn: e.target.checked })} />{t('prefPasswordOn')}</label>
          {prefs.passwordOn && <div className="price-grid price-grid--two">
            <Field id="pref-password" type="password" autoComplete="new-password" maxLength={100} label={wasLocked ? t('prefPasswordNew') : t('prefPasswordSet')} help={wasLocked ? t('prefPasswordKeep') : t('prefPasswordRule')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Field id="pref-message" label={t('prefPasswordMessage')} maxLength={300} placeholder={t('prefPasswordMessageHint')} value={prefs.passwordMessage} onChange={(e) => setP({ passwordMessage: e.target.value })} />
          </div>}
          {prefs.passwordOn && wasLocked && <a className="field__help" href={`${url}/password`} target="_blank" rel="noopener">{t('prefPasswordView')}</a>}
        </>)}
      </fieldset>

      {picking && <MediaPicker selected={prefs.shareImage ? [prefs.shareImage] : []} max={1} onClose={() => setPicking(false)} onDone={(items) => { setP({ shareImage: items[0] ?? null }); setPicking(false) }} />}
      <div className="toast-anchor" role="status">{done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{L(['সেভ হয়েছে।', 'Saved.'])}</p>}</div>
    </form>
  )
}
