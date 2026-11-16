import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { styleFromPreset, type SiteColors, type SiteStyle } from 'storefront/site'
import { pageFonts, presetIds, presets } from 'storefront/themes'
import { useCurrentStore } from '../account-context'
import { api, errorCode } from '../api'
import { ColorControl } from '../components/SectionDesignControls'
import { Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

const CssEditor = lazy(() => import('../components/CssEditor'))

// Online store › Site settings: the look every template and landing page uses (like Elementor's Site Settings).
export function SiteSettings() {
  const { t, lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const current = useCurrentStore()!
  const base = `/stores/${current.store.handle}/site-style`
  const canEdit = current.role !== 'staff'
  const [form, setForm] = useState<SiteStyle | null>(null)
  const [saved, setSaved] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const show = (s: SiteStyle) => { setForm(s); setSaved(JSON.stringify(s)) }
  const load = useCallback(async () => {
    setFailed(false)
    try { show(await api<SiteStyle>(base)) } catch { setFailed(true) }
  }, [base])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  if (failed) return <div className="page page--narrow"><section className="card card--flush"><Notice role="alert" title={t('errGeneric')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section></div>
  if (!form) return <div className="page page--narrow"><Skeleton width="16rem" /><section className="card"><Skeleton /></section></div>

  const set = (next: Partial<SiteStyle>) => setForm({ ...form, ...next })
  const dirty = JSON.stringify(form) !== saved
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try { show(await api<SiteStyle>(base, { method: 'PUT', body: form })); setDone(true) } catch (err) { setError(errorCode(err)) } finally { setBusy(false) }
  }
  const colorLabels: Record<keyof SiteColors, readonly [string, string]> = {
    accent: ['মূল রং (বাটন, দাম)', 'Main colour (buttons, prices)'], ink: ['লেখার রং', 'Text colour'], paper: ['পটভূমি', 'Background'], tint: ['হালকা পটভূমি', 'Soft background'], rule: ['রেখা ও বর্ডার', 'Lines and borders'],
  }
  const c = form.colors

  return (
    <form className="page page--narrow" onSubmit={(e) => void save(e)} noValidate>
      <PageHeader title={L(['সাইট সেটিংস', 'Site settings'])} description={L(['পুরো দোকান আর সব ল্যান্ডিং পেজের রং, ফন্ট ও আকার।', 'Colours, fonts and sizes for your whole store and every landing page.'])}
        action={canEdit ? <Button type="submit" variant="primary" disabled={busy || !dirty} aria-busy={busy}>{t('productSave')}</Button> : undefined} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      <fieldset className="stack" disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        {/* A sample in the chosen look (the store's colours, not the dashboard's). */}
        <section className="card site-sample" aria-hidden="true" style={{ background: c.paper, color: c.ink, borderColor: c.rule, fontFamily: `${form.latin ? `"${form.latin}", ` : ''}"${form.bangla || 'Hind Siliguri'}", sans-serif` }}>
          <strong>{current.store.name}</strong>
          <span style={{ background: c.tint, borderRadius: form.radius, borderColor: c.rule }}>পণ্যের নাম · <b style={{ color: c.accent }}>৳১,২০০</b></span>
          <span className="site-sample__button" style={{ background: c.accent, borderRadius: form.radius, color: c.paper }}>এখনই অর্ডার করুন</span>
        </section>
        <section className="card card--form">
          <h2>{L(['এক ক্লিকে স্টাইল', 'One-click style'])}</h2>
          <div className="theme-styles">
            {presetIds.map((id) => {
              const v = presets[id].vars
              return <button key={id} type="button" className="theme-styles__item" onClick={() => set({ ...styleFromPreset(id), latin: form.latin, width: form.width, css: form.css })}><span style={{ background: v.paper, borderColor: v.rule }}><i style={{ background: v.accent }} /></span>{presets[id].label[lang === 'bn' ? 0 : 1]}</button>
            })}
          </div>
        </section>
        <section className="card card--form">
          <h2>{L(['রং', 'Colours'])}</h2>
          {(Object.keys(colorLabels) as (keyof SiteColors)[]).map((key) => (
            <ColorControl key={key} id={`site-color-${key}`} label={L(colorLabels[key])} value={c[key]} inherited="" onChange={(value) => { if (/^#[0-9a-f]{6}$/i.test(value)) set({ colors: { ...c, [key]: value.toLowerCase() } }) }} />
          ))}
        </section>
        <section className="card card--form">
          <h2>{L(['লেখা ও আকার', 'Type and size'])}</h2>
          {(['bangla', 'latin'] as const).map((kind) => <div key={kind} className="field">
            <label htmlFor={`site-font-${kind}`}>{kind === 'bangla' ? L(['বাংলা ফন্ট', 'Bangla font']) : L(['ইংরেজি ফন্ট', 'English font'])}</label>
            <select className="input" id={`site-font-${kind}`} value={form[kind]} onChange={(e) => set({ [kind]: e.target.value })}>
              <option value="">{L(['সাধারণ', 'Default'])}</option>
              {Object.keys(pageFonts[kind]).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>)}
          <Field id="site-radius" type="number" label={L(['কোণের গোলভাব (px)', 'Corner roundness (px)'])} min={0} max={32} value={String(form.radius)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (n >= 0 && n <= 32) set({ radius: n }) }} />
          <Field id="site-width" type="number" label={L(['কন্টেন্টের সর্বোচ্চ প্রস্থ (px)', 'Content max width (px)'])} min={720} max={1600} step={20} value={String(form.width)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (n >= 720 && n <= 1600) set({ width: n }) }} />
        </section>
        <section className="card card--form">
          <Suspense fallback={<div className="css-editor css-editor--loading" />}>
            <CssEditor value={form.css} label={L(['পুরো সাইটের কাস্টম CSS', 'Custom CSS for the whole site'])} describedBy="site-css-help" maxLength={20000} onChange={(css) => set({ css })} />
          </Suspense>
          {form.css.includes('<')
            ? <p className="field__help field__help--error" role="alert">{L(['CSS-এ < চিহ্ন রাখা যাবে না।', 'CSS cannot contain the < character.'])}</p>
            : <p className="field__help" id="site-css-help">{L(['দোকানের সব পেজ ও ল্যান্ডিং পেজে কাজ করে।', 'Applies to every store page and landing page.'])}</p>}
        </section>
      </fieldset>
      <div className="toast-anchor" role="status">{done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{L(['সাইট সেটিংস সেভ হয়েছে।', 'Site settings saved.'])}</p>}</div>
    </form>
  )
}
