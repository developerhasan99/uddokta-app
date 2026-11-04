import { useEffect, useState } from 'react'
import { CircleCheck, ExternalLink } from 'lucide-react'
import { isPreset, presetFontsHref, presetIds, presets, type PresetId } from 'storefront/themes'
import { useCurrentStore } from '../account-context'
import { api, errorCode, storefrontUrl } from '../api'
import { Badge, Button, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import type { StoreSettingsData } from './StoreSettings'

export function Themes() {
  const { t, lang } = useLang()
  const current = useCurrentStore()!
  const handle = current.store.handle
  const canEdit = current.role !== 'staff'
  const [theme, setTheme] = useState<PresetId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api<StoreSettingsData>(`/stores/${handle}/settings`).then((s) => setTheme(isPreset(s.theme) ? s.theme : 'fresh')).catch((err) => setError(errorCode(err)))
  }, [handle])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 4000)
    return () => clearTimeout(timer)
  }, [done])

  const use = async (id: PresetId) => {
    setBusy(true)
    setError(null)
    try {
      await api(`/stores/${handle}/theme`, { method: 'PUT', body: { theme: id } })
      setTheme(id)
      setDone(true)
    } catch (err) {
      setError(errorCode(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      {presetIds.map((id) => <link key={id} rel="stylesheet" href={presetFontsHref(id)} />)}
      <PageHeader title={t('themes')} description={t('themesHelp')} action={<a className="btn" href={storefrontUrl(handle)} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>} />
      {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      {!canEdit && <p className="muted">{t('themesManagersOnly')}</p>}
      {!theme && !error && <section className="card"><Skeleton /></section>}
      {theme && (
        <ul className="theme-grid" aria-label={t('themesPick')}>
          {presetIds.map((id) => {
            const p = presets[id]
            const v = p.vars
            return (
              <li key={id} className={id === theme ? 'theme-card theme-card--current' : 'theme-card'}>
                {/* The preview is drawn in the preset's own colours: these are the store's colours, not the dashboard's. */}
                <div className="theme-card__preview" style={{ background: v.paper, color: v.ink, fontFamily: `"${p.font}", sans-serif`, borderRadius: 8 }}>
                  <div style={{ background: v.tint, borderRadius: v.radius, padding: 12 }}>
                    <strong style={{ fontSize: 18 }}>{current.store.name}</strong>
                    <p style={{ margin: '4px 0 10px', opacity: 0.75 }}>৳১,২০০</p>
                    <span style={{ display: 'inline-block', background: v.accent, color: v.paper === '#141414' ? '#141414' : '#fff', borderRadius: v.radius, padding: '6px 12px', fontWeight: 700 }}>এখনই অর্ডার করুন</span>
                  </div>
                </div>
                <div className="theme-card__foot">
                  <strong>{p.label[lang === 'bn' ? 0 : 1]}</strong>
                  {id === theme
                    ? <Badge tone="success">{t('themesCurrent')}</Badge>
                    : canEdit && <Button disabled={busy} onClick={() => void use(id)}>{t('themesUse')}</Button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="toast-anchor" role="status">
        {done && <p className="toast"><CircleCheck size={18} aria-hidden="true" />{t('themesSaved')}</p>}
      </div>
    </div>
  )
}
