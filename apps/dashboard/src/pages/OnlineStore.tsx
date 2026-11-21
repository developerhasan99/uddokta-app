import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { loadScreen } from '../components/ScreenError'
import { Link } from 'react-router'
import { Check, ChevronRight, LockOpen, Paintbrush, CircleCheck, Copy, ExternalLink, FileText, Globe, ImagePlus, LayoutTemplate, ListTree, Lock } from 'lucide-react'
import { defaultRobots } from 'storefront/paths'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode, storefrontUrl, type MediaItem } from '../api'
import { MediaPicker } from '../components/MediaPicker'
import { DialogHead } from '../components/DialogHead'
import { useDialog } from '../components/dialog'
import { StoreFrame } from '../components/StoreFrame'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

const HtmlEditor = lazy(() => loadScreen(() => import('../components/HtmlEditor')))

type Prefs = { homeTitle: string; homeDescription: string; shareImage: MediaItem | null; passwordOn: boolean; passwordMessage: string; language: 'bn' | 'en'; seoHidden: boolean; robotsTxt: string; sitemapKinds: SitemapKind[]; codeHead: string; codeBodyStart: string; codeBodyEnd: string }
type SitemapKind = 'product' | 'collection' | 'storePage' | 'landingPage'
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
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saved, setSaved] = useState({ prefs: '' })
  const [access, setAccess] = useState(false)
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
      const p = await api<Prefs>(`/stores/${handle}/preferences`)
      setPrefs(p)
      setSaved({ prefs: JSON.stringify(p) })
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
  const unsaved = Boolean(prefs && JSON.stringify(prefs) !== saved.prefs)
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  if (failed) return <div className="page page--narrow"><section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!prefs) return <div className="page page--narrow"><Skeleton width="16rem" /><section className="card"><Skeleton /><Skeleton width="60%" /></section></div>

  const prefsDirty = JSON.stringify(prefs) !== saved.prefs
  const setP = (next: Partial<Prefs>) => setPrefs({ ...prefs, ...next })
  const wasLocked = (JSON.parse(saved.prefs) as Prefs).passwordOn

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const nextPrefs = prefsDirty ? await api<Prefs>(`/stores/${handle}/preferences`, { method: 'PUT', body: { homeTitle: prefs.homeTitle, homeDescription: prefs.homeDescription, shareImageId: prefs.shareImage?.id ?? null, passwordOn: prefs.passwordOn, passwordMessage: prefs.passwordMessage, language: prefs.language, seoHidden: prefs.seoHidden, robotsTxt: prefs.robotsTxt, sitemapKinds: prefs.sitemapKinds, codeHead: prefs.codeHead, codeBodyStart: prefs.codeBodyStart, codeBodyEnd: prefs.codeBodyEnd } }) : prefs
      setPrefs(nextPrefs)
      setSaved({ prefs: JSON.stringify(nextPrefs) })
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    setPrefs(JSON.parse(saved.prefs) as Prefs)
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

  return (
    <form className="page page--settings" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={t('onlineStore')} description={t('onlineStore.d')} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{L(['এখানের সেটিংস শুধু মালিক ও অ্যাডমিন বদলাতে পারেন।', 'Only owners and admins can change these settings.'])}</p>}

      <section className="card store-hero">
        {/* The live store's home page (shown without its pixels or custom code); clicking opens Customize. */}
        <Link className="store-hero__preview" to={path('/online-store/customize')} aria-label={L(['দোকান সাজান', 'Customize store'])}>
          <StoreFrame url={url} label={L(['দোকানের হোম পেজ', "The store's home page"])} />
          <span className="store-hero__customize" aria-hidden="true"><Paintbrush size={12} />{L(['সাজান', 'Customize'])}</span>
        </Link>
        <div className="store-hero__side">
          <div className="store-hero__info">
            <h2>{current.store.name}
              {wasLocked
                ? <Badge tone="warning"><Lock size={11} aria-hidden="true" /> {L(['পাসওয়ার্ড দিয়ে বন্ধ', 'Password protected'])}</Badge>
                : <Badge tone="success">{L(['চালু', 'Live'])}</Badge>}
            </h2>
            <div className="store-hero__meta">
              <Globe size={14} aria-hidden="true" />
              <a href={url} target="_blank" rel="noopener">{url.replace(/^https?:\/\//, '')}</a>
              <button type="button" className="btn btn--icon" aria-label={L(['ঠিকানা কপি করুন', 'Copy address'])} title={L(['ঠিকানা কপি করুন', 'Copy address'])} onClick={copy}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button>
            </div>
            {/* Who can open the store: everyone, or only people with the password (landing pages always stay open). */}
            <div className="store-hero__meta">
              {wasLocked ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
              <span>{wasLocked ? L(['পাসওয়ার্ড দিয়ে বন্ধ', 'Password protected']) : L(['সবার জন্য খোলা', 'Open to everyone'])}</span>
              {canEdit && <><span className="store-hero__dot" aria-hidden="true">·</span><button type="button" className="link-button" onClick={() => setAccess(true)}>{wasLocked ? L(['বদলান', 'Change']) : L(['পাসওয়ার্ড দিন', 'Add password'])}</button></>}
            </div>
          </div>
          <div className="store-hero__actions">
            <Link className="btn btn--primary" to={path('/online-store/customize')}><Paintbrush size={16} aria-hidden="true" />{L(['সাজান', 'Customize'])}</Link>
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
        {section(L(['দোকানের ভাষা', 'Store language']), L(['বাটন, অর্ডার ফর্ম আর বার্তা এই ভাষায় দেখাবে। আপনার নিজের লেখা যেমন লিখেছেন তেমনই থাকবে।', 'Buttons, the order form and messages show in this language. What you write yourself stays as you wrote it.']), <>
          <div className="segmented" role="radiogroup" aria-label={L(['দোকানের ভাষা', 'Store language'])}>
            {([['bn', 'বাংলা'], ['en', 'English']] as const).map(([value, label]) => (
              <label key={value}><input type="radio" name="store-language" value={value} checked={prefs.language === value} onChange={() => setP({ language: value })} /><span lang={value}>{label}</span></label>
            ))}
          </div>
          <p className="field__help">{prefs.language === 'en'
            ? L(['যেমন: "Order now", "Your name", "Free delivery", ৳1,200।', 'For example: "Order now", "Your name", "Free delivery", ৳1,200.'])
            : L(['যেমন: "অর্ডার করুন", "আপনার নাম", "ডেলিভারি ফ্রি", ৳১,২০০।', 'For example: "অর্ডার করুন", "আপনার নাম", "ডেলিভারি ফ্রি", ৳১,২০০.'])}</p>
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


        {section(L(['সার্চ ইঞ্জিন', 'Search engines']), L(['Google-এর মতো সার্চ ইঞ্জিন আপনার দোকান কীভাবে খুঁজে পাবে। সাইটম্যাপ নিজে থেকে তৈরি হয়।', 'How Google and other search engines find your store. The sitemap is made for you.']), <>
          <label className="switch-row switch-row--flush">
            <input type="checkbox" className="check" checked={!prefs.seoHidden} onChange={(e) => setP({ seoHidden: !e.target.checked })} />
            <span className="switch-row__text"><span className="switch-row__title">{L(['সার্চ ইঞ্জিনে দোকান দেখাবে', 'Show the store in search engines'])}</span><span className="muted">{prefs.seoHidden
              ? L(['বন্ধ: কোনো পেজ সার্চে আসবে না। দোকান সাজানোর সময় এভাবে রাখতে পারেন।', 'Off: no page shows in search results. Useful while you set the store up.'])
              : L(['চালু: দোকান, পণ্য আর ল্যান্ডিং পেজ সার্চে আসতে পারে।', 'On: the store, products and landing pages can show in search results.'])}</span></span>
          </label>
          <div className="field">
            <span className="field__label">{L(['সাইটম্যাপ', 'Sitemap'])}</span>
            <a href={`${url}/sitemap.xml`} target="_blank" rel="noopener">{`${url}/sitemap.xml`}</a>
            <span className="field__help">{L(['Google Search Console-এ এই লিংকটি জমা দিন। নতুন পণ্য, কালেকশন আর পেজ নিজে থেকেই যোগ হয়; খসড়া আর লুকানো পণ্য বাদ থাকে।', 'Submit this link in Google Search Console. New products, collections and pages are added by themselves; drafts and unlisted products are left out.'])}</span>
          </div>
          <fieldset className="check-row">
            <legend className="field__label">{L(['সাইটম্যাপে যা থাকবে', 'What the sitemap lists'])}</legend>
            {([['product', L(['পণ্য', 'Products'])], ['collection', L(['কালেকশন', 'Collections'])], ['storePage', L(['দোকানের পেজ', 'Store pages'])], ['landingPage', L(['ল্যান্ডিং পেজ', 'Landing pages'])]] as const).map(([kind, label]) => (
              <label key={kind} className="check-line"><input type="checkbox" className="check" checked={prefs.sitemapKinds.includes(kind)} onChange={(e) => setP({ sitemapKinds: e.target.checked ? [...prefs.sitemapKinds, kind] : prefs.sitemapKinds.filter((k) => k !== kind) })} />{label}</label>
            ))}
          </fieldset>
          <div className="field">
            <label className="field__label" htmlFor="pref-robots">robots.txt</label>
            <textarea id="pref-robots" className="input input--area input--mono" rows={7} maxLength={5000} spellCheck={false} placeholder={defaultRobots} value={prefs.robotsTxt} onChange={(e) => setP({ robotsTxt: e.target.value })} />
            <span className="field__help">{L(['ফাঁকা রাখলে আমাদের নিয়ম চলে (ধূসর লেখা): কার্ট, অ্যাকাউন্ট আর খোঁজার পেজ বাদ। সাইটম্যাপের লাইন নিজে থেকে যোগ হয়।', 'Leave it blank to use ours (the grey text): carts, accounts and search pages stay out. The sitemap line is added for you.'])} <a href={`${url}/robots.txt`} target="_blank" rel="noopener">{L(['এখন যা আছে দেখুন', 'See the current file'])}</a></span>
          </div>
        </>)}

        {section(L(['কাস্টম কোড', 'Custom code']), L(['Google Search Console যাচাই, Google Analytics, Tag Manager, চ্যাট উইজেটের মতো কোড এখানে দিন। দোকানের সব পেজ আর ল্যান্ডিং পেজে যেমন লিখেছেন তেমনই বসবে।', 'Code such as Google Search Console verification, Google Analytics, Tag Manager or a chat widget. It goes into every store page and landing page exactly as written.']), <>
          {([
            ['codeHead', L(['</head> এর ঠিক আগে', 'Just before </head>']), L(['যাচাইয়ের মেটা ট্যাগ, Analytics বা Tag Manager-এর মূল কোড।', 'Verification meta tags, the main Analytics or Tag Manager code.'])],
            ['codeBodyStart', L(['<body> এর ঠিক পরে', 'Right after <body>']), L(['যেমন Tag Manager-এর noscript অংশ।', 'For example Tag Manager\'s noscript part.'])],
            ['codeBodyEnd', L(['</body> এর ঠিক আগে', 'Just before </body>']), L(['চ্যাট উইজেট বা পেজ লোডের পরে চলা স্ক্রিপ্ট।', 'Chat widgets or scripts that run after the page loads.'])],
          ] as const).map(([key, label, help]) => (
            <div key={key} className="field code-slot" id={`pref-${key}`}>
              <Suspense fallback={<div className="css-editor css-editor--loading" />}><HtmlEditor value={prefs[key]} label={label} describedBy={`pref-${key}-help`} maxLength={50000} onChange={(v) => setP({ [key]: v })} /></Suspense>
              <span className="field__help" id={`pref-${key}-help`}>{help}</span>
            </div>
          ))}
          <p className="muted">{L(['কোড শুধু আসল দোকানে চলে, ড্যাশবোর্ড বা এডিটরের প্রিভিউতে নয়। ভুল কোডে দোকানের পেজ ভেঙে যেতে পারে, তাই অন্যের দেওয়া কোড বুঝে নিয়ে বসান।', 'Code runs only on the live store, never in the dashboard or the editor preview. Broken code can break your pages, so only add code you trust.'])}</p>
        </>)}
      </fieldset>

      {access && <StoreAccessDialog handle={handle} url={url} saved={JSON.parse(saved.prefs) as Prefs} onClose={() => setAccess(false)}
        onSaved={(next) => {
          // Only the access settings changed: keep any other edits on this page as they are.
          setPrefs({ ...prefs, passwordOn: next.passwordOn, passwordMessage: next.passwordMessage })
          setSaved({ prefs: JSON.stringify({ ...(JSON.parse(saved.prefs) as Prefs), passwordOn: next.passwordOn, passwordMessage: next.passwordMessage }) })
        }} />}
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

// Store access: open to everyone, or a password (any length) while the store is being prepared. Saved on its own, with the
// store's other saved preferences sent as they are (the API keeps the current password when none is typed). The password
// shows as plain text: the seller shares it with the people they let in.
function StoreAccessDialog({ handle, url, saved, onClose, onSaved }: { handle: string; url: string; saved: Prefs; onClose: () => void; onSaved: (next: Prefs) => void }) {
  const { t, lang } = useLang()
  const L = (pair: readonly [string, string]) => pair[lang === 'bn' ? 0 : 1]
  const { ref, close, props } = useDialog(onClose)
  const [on, setOn] = useState(saved.passwordOn)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(saved.passwordMessage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  const changed = on !== saved.passwordOn || (on && (password.trim() !== '' || message !== saved.passwordMessage))
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const next = await api<Prefs>(`/stores/${handle}/preferences`, { method: 'PUT', body: { homeTitle: saved.homeTitle, homeDescription: saved.homeDescription, shareImageId: saved.shareImage?.id ?? null, passwordOn: on, password, passwordMessage: message, language: saved.language } })
      close(() => { onSaved(next); onClose() })
    } catch (err) { setError(errorCode(err)); setBusy(false) }
  }
  return <dialog {...props} className="modal store-access" aria-labelledby="store-access-title" onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <DialogHead id="store-access-title" title={L(['দোকানে কে ঢুকতে পারবে', 'Who can visit the store'])} disabled={busy} onClose={() => close()} />
    <div className="dialog__body">
      {/* The same pill switch as elsewhere; the fields below always show (inactive while open), so the dialog never jumps. */}
      <div className="segmented store-access__switch" role="radiogroup" aria-label={L(['দোকানে কে ঢুকতে পারবে', 'Who can visit the store'])}>
        {([[false, LockOpen, L(['সবার জন্য খোলা', 'Open to everyone'])], [true, Lock, L(['পাসওয়ার্ড দিয়ে বন্ধ', 'Password protected'])]] as const).map(([value, Icon, label]) => (
          <label key={String(value)}><input type="radio" name="store-access" checked={on === value} disabled={busy} onChange={() => setOn(value)} /><span><Icon size={14} aria-hidden="true" />{label}</span></label>
        ))}
      </div>
      <p className="field__help">{L(['পাসওয়ার্ড থাকলে ক্রেতারা দোকানে ঢুকতে পাসওয়ার্ড লাগবে। ল্যান্ডিং পেজ সবসময় খোলা থাকে, তাই বিজ্ঞাপন চলতে থাকবে।', 'With a password, buyers need it to enter the store. Landing pages always stay open, so ads keep running.'])}</p>
      <div className="access-fields" aria-disabled={!on || undefined}>
        <Field id="access-password" autoComplete="off" spellCheck={false} maxLength={100} disabled={busy || !on} label={saved.passwordOn ? t('prefPasswordNew') : t('prefPasswordSet')} help={saved.passwordOn ? t('prefPasswordKeep') : t('prefPasswordRule')} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="access-message" maxLength={300} disabled={busy || !on} label={t('prefPasswordMessage')} placeholder={t('prefPasswordMessageHint')} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      {saved.passwordOn && <a className="link-button" href={`${url}/password`} target="_blank" rel="noopener"><ExternalLink size={14} aria-hidden="true" />{t('prefPasswordView')}</a>}
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
    </div>
    <footer className="dialog__foot dialog__foot--split">
      <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy || !changed || (on && !saved.passwordOn && !password.trim())} aria-busy={busy} onClick={() => void save()}>{L(['সেভ করুন', 'Save'])}</Button>
    </footer>
  </dialog>
}
