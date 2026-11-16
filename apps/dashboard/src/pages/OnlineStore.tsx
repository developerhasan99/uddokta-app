import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, ChevronRight, CircleCheck, Copy, ExternalLink, FileText, Globe, ImagePlus, LayoutTemplate, ListTree, Lock } from 'lucide-react'
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
  const [copied, setCopied] = useState(false)

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
  const unsaved = Boolean(style && prefs && (JSON.stringify(style) !== saved.style || JSON.stringify(prefs) !== saved.prefs || password !== ''))
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

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
  const discard = () => {
    setStyle(JSON.parse(saved.style) as SiteStyle)
    setPrefs(JSON.parse(saved.prefs) as Prefs)
    setPassword('')
    setError(null)
  }
  const copy = () => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  const part = (to: string, Icon: typeof FileText, title: string, help: string, count: number | null, badge?: ReactNode) => (
    <Link className="store-part" to={path(to)}>
      <span className="store-part__icon"><Icon size={16} strokeWidth={1.75} aria-hidden="true" /></span>
      <span className="store-part__text"><strong>{title}{count !== null && <span className="store-part__count">{num(count)}</span>}{badge}</strong><span className="muted">{help}</span></span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  )
  const section = (title: string, help: string, children: ReactNode) => (
    <section className="settings-split">
      <div className="settings-split__head"><h2>{title}</h2><p className="muted">{help}</p></div>
      <div className="card card--form settings-split__body">{children}</div>
    </section>
  )
  const font = `${style.latin ? `"${style.latin}", ` : ''}"${style.bangla || 'Hind Siliguri'}", sans-serif`
  const radius = Math.min(style.radius, 16)
  // A small store home page drawn with the chosen look (the store's colours, not the dashboard's), updated as settings change.
  const sample = (
    <div className="look-sample" aria-hidden="true" style={{ background: c.paper, color: c.ink, fontFamily: font }}>
      <div className="look-sample__bar" style={{ borderColor: c.rule }}><strong>{current.store.name}</strong><span>হোম</span><span>পণ্য</span><span>যোগাযোগ</span></div>
      <div className="look-sample__hero" style={{ background: c.tint, borderRadius: radius }}>
        <strong>নতুন কালেকশন এসেছে</strong>
        <span>সারা দেশে ক্যাশ অন ডেলিভারি</span>
        <span className="look-sample__button" style={{ background: c.accent, color: c.paper, borderRadius: radius }}>এখনই কিনুন</span>
      </div>
      <div className="look-sample__grid">
        {['৳১,২০০', '৳৮৫০', '৳২,৪০০'].map((price) => <div key={price} className="look-sample__card">
          <div className="look-sample__image" style={{ background: c.tint, borderRadius: radius, borderColor: c.rule }} />
          <span>পণ্যের নাম</span>
          <strong style={{ color: c.accent }}>{price}</strong>
        </div>)}
      </div>
    </div>
  )
  const group = (title: string, children: ReactNode) => <div className="look-group"><h3>{title}</h3>{children}</div>

  return (
    <form className="page page--settings" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('onlineStore')} description={t('onlineStore.d')} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{L(['এখানের সেটিংস শুধু মালিক ও অ্যাডমিন বদলাতে পারেন।', 'Only owners and admins can change these settings.'])}</p>}

      <section className="card store-hero">
        <div className="store-hero__preview">{sample}</div>
        <div className="store-hero__info">
          <div className="store-hero__head">
            <h2>{current.store.name}</h2>
            {wasLocked
              ? <Badge tone="warning"><Lock size={11} aria-hidden="true" /> {L(['পাসওয়ার্ড দিয়ে বন্ধ', 'Password protected'])}</Badge>
              : <Badge tone="success">{L(['চালু', 'Live'])}</Badge>}
          </div>
          <div className="store-hero__address">
            <Globe size={14} aria-hidden="true" />
            <a href={url} target="_blank" rel="noopener">{url.replace(/^https?:\/\//, '')}</a>
            <button type="button" className="btn btn--icon" aria-label={L(['ঠিকানা কপি করুন', 'Copy address'])} title={L(['ঠিকানা কপি করুন', 'Copy address'])} onClick={copy}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button>
          </div>
          <div className="row">
            <Link className="btn btn--primary" to={path('/online-store/templates')}><LayoutTemplate size={16} aria-hidden="true" />{L(['ডিজাইন করুন', 'Customize'])}</Link>
            <a className="btn" href={url} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>
          </div>
          <nav className="store-parts" aria-label={t('onlineStore')}>
            {part('/online-store/templates', LayoutTemplate, t('templates'), L(['হেডার, ফুটার আর প্রতিটি পেজের নকশা', 'Header, footer and each page type']), counts?.templates ?? null)}
            {part('/online-store/pages', FileText, t('pages'), L(['আমাদের সম্পর্কে, নীতিমালা, যোগাযোগ', 'About, policies and contact']), counts?.pages ?? null)}
            {part('/online-store/menus', ListTree, t('menus'), L(['হেডার ও ফুটারের লিংক', 'Links in the header and footer']), counts?.menus ?? null, counts && counts.broken > 0 ? <Badge tone="warning">{t('menuBrokenCount', { n: num(counts.broken) })}</Badge> : undefined)}
          </nav>
        </div>
      </section>

      <fieldset className="settings-stack" disabled={!canEdit}>
        {section(L(['চেহারা', 'Look']), L(['পুরো দোকান আর সব ল্যান্ডিং পেজের রং, ফন্ট ও আকার।', 'Colours, fonts and sizes for the whole store and every landing page.']), <>
          {group(L(['স্টাইল', 'Style']), <div className="look-presets" role="group" aria-label={L(['এক ক্লিকে স্টাইল', 'One-click style'])}>
            {presetIds.map((id) => {
              const v = presets[id].vars
              const on = v.accent === c.accent && v.paper === c.paper
              return <button key={id} type="button" className="look-preset" aria-pressed={on} title={presets[id].label[lang === 'bn' ? 0 : 1]} onClick={() => setS({ ...styleFromPreset(id), latin: style.latin, width: style.width, css: style.css })}>
                <span className="look-preset__dot" style={{ background: v.paper, borderColor: v.rule }}><i style={{ background: v.accent }} /></span>{presets[id].label[lang === 'bn' ? 0 : 1]}
              </button>
            })}
          </div>)}
          {group(L(['রং', 'Colours']), <div className="look-colors">
            {(Object.keys(colorLabels) as (keyof SiteColors)[]).map((key) => (
              <ColorControl key={key} id={`site-color-${key}`} label={L(colorLabels[key])} value={c[key]} inherited="" onChange={(value) => { if (/^#[0-9a-f]{6}$/i.test(value)) setS({ colors: { ...c, [key]: value.toLowerCase() } }) }} />
            ))}
          </div>)}
          {group(L(['লেখা ও আকার', 'Type and size']), <><div className="price-grid price-grid--two">
            {(['bangla', 'latin'] as const).map((kind) => <div key={kind} className="field">
              <label htmlFor={`site-font-${kind}`}>{kind === 'bangla' ? L(['বাংলা ফন্ট', 'Bangla font']) : L(['ইংরেজি ফন্ট', 'English font'])}</label>
              <select className="input" id={`site-font-${kind}`} value={style[kind]} onChange={(e) => setS({ [kind]: e.target.value })}>
                <option value="">{L(['সাধারণ', 'Default'])}</option>
                {Object.keys(pageFonts[kind]).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>)}
          </div>
          <div className="price-grid price-grid--two">
            <label className="look-range">
              <span className="look-range__head"><span>{L(['কোণের গোলভাব', 'Corner roundness'])}</span><output>{num(style.radius)}px</output></span>
              <input type="range" min={0} max={32} value={style.radius} onChange={(e) => setS({ radius: Number(e.target.value) })} />
            </label>
            <label className="look-range">
              <span className="look-range__head"><span>{L(['কন্টেন্টের প্রস্থ', 'Content width'])}</span><output>{num(style.width)}px</output></span>
              <input type="range" min={720} max={1600} step={20} value={style.width} onChange={(e) => setS({ width: Number(e.target.value) })} />
            </label>
          </div></>)}
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
          <div className="serp" aria-hidden="true">
            <span className="serp__url">{url.replace(/^https?:\/\//, '')}</span>
            <span className="serp__title">{prefs.homeTitle || current.store.name}</span>
            <span className="serp__text">{prefs.homeDescription || L(['বর্ণনা লিখলে সার্চে এখানে দেখাবে।', 'Your description shows here in search results.'])}</span>
          </div>
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
          <label className="switch-row switch-row--flush">
            <input type="checkbox" className="check" checked={prefs.passwordOn} onChange={(e) => setP({ passwordOn: e.target.checked })} />
            <span className="switch-row__text"><span className="switch-row__title">{t('prefPasswordOn')}</span><span className="muted">{wasLocked ? L(['ক্রেতারা এখন পাসওয়ার্ড ছাড়া দোকানে ঢুকতে পারছেন না।', 'Buyers need the password to enter right now.']) : L(['চালু করলে দোকানে ঢুকতে পাসওয়ার্ড লাগবে।', 'When on, buyers need a password to enter.'])}</span></span>
          </label>
          {prefs.passwordOn && <div className="price-grid price-grid--two">
            <Field id="pref-password" type="password" autoComplete="new-password" maxLength={100} label={wasLocked ? t('prefPasswordNew') : t('prefPasswordSet')} help={wasLocked ? t('prefPasswordKeep') : t('prefPasswordRule')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Field id="pref-message" label={t('prefPasswordMessage')} maxLength={300} placeholder={t('prefPasswordMessageHint')} value={prefs.passwordMessage} onChange={(e) => setP({ passwordMessage: e.target.value })} />
          </div>}
          {prefs.passwordOn && wasLocked && <a className="field__help" href={`${url}/password`} target="_blank" rel="noopener">{t('prefPasswordView')}</a>}
        </>)}
      </fieldset>

      {picking && <MediaPicker selected={prefs.shareImage ? [prefs.shareImage] : []} max={1} onClose={() => setPicking(false)} onDone={(items) => { setP({ shareImage: items[0] ?? null }); setPicking(false) }} />}
      {/* Appears only while something is unsaved, next to wherever the seller is working. */}
      {canEdit && unsaved && <div className="save-bar" role="region" aria-label={L(['সেভ না করা পরিবর্তন', 'Unsaved changes'])}>
        <span>{L(['সেভ না করা পরিবর্তন', 'Unsaved changes'])}</span>
        <Button disabled={busy} onClick={discard}>{t('productDiscard')}</Button>
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('productSave')}</Button>
      </div>}
      <div className="toast-anchor" role="status">{done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{L(['সেভ হয়েছে।', 'Saved.'])}</p>}</div>
    </form>
  )
}
