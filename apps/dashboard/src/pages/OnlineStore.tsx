import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, FileText, LayoutTemplate, ListTree, Lock, Palette, Settings2 } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, storefrontUrl } from '../api'
import { Badge, LinkButton, PageHeader } from '../components/ui'
import { useLang } from '../i18n'

type Summary = { templates: number; pages: number; menus: number; broken: number; locked: boolean }

// Online store at a glance: the address, the live theme, and where to change pages, menus and preferences.
export function OnlineStore() {
  const { t, num } = useLang()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const url = storefrontUrl(handle)
  const [s, setS] = useState<Summary | null>(null)

  useEffect(() => {
    const base = `/stores/${handle}`
    Promise.all([
      api<unknown[]>(`${base}/templates`).catch(() => []),
      api<unknown[]>(`${base}/store-pages`).catch(() => []),
      api<{ broken: number }[]>(`${base}/menus`).catch(() => []),
      api<{ passwordOn: boolean }>(`${base}/preferences`).catch(() => ({ passwordOn: false })),
    ]).then(([templates, pages, menus, prefs]) => {
      setS({ templates: templates.length, pages: pages.length, menus: menus.length, broken: menus.reduce((n, m) => n + m.broken, 0), locked: prefs.passwordOn })
    })
  }, [handle])

  const tile = (Icon: typeof Palette, title: string, body: string, to: string, action: string, badge?: ReactNode) => (
    <section className="card store-tile">
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      <div className="store-tile__body">
        <h2>{title}{badge}</h2>
        <p className="muted">{body}</p>
      </div>
      <LinkButton to={path(to)}>{action}</LinkButton>
    </section>
  )

  return (
    <div className="page page--narrow">
      <PageHeader title={t('onlineStore')} description={t('onlineStore.d')} action={<a className="btn btn--primary" href={url} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>} />
      <section className="card">
        <h2>{t('storeAddressTitle')}</h2>
        <p><a href={url} target="_blank" rel="noopener">{url}</a></p>
        <p className="muted">{t('storeAddressHelp')}</p>
        {s?.locked && <p className="store-tile__locked"><Lock size={14} aria-hidden="true" />{t('prefPasswordOn')}</p>}
      </section>
      <div className="store-tiles">
        {tile(LayoutTemplate, t('templates'), s ? t('storeOverviewTemplates', { n: num(s.templates) }) : t('templates.d'), '/online-store/templates', t('storeOverviewOpen'))}
        {tile(Palette, t('siteSettings'), t('siteSettings.d'), '/online-store/site-settings', t('storeOverviewOpen'))}
        {tile(FileText, t('pages'), s ? t('storeOverviewPages', { n: num(s.pages) }) : t('pages.d'), '/online-store/pages', t('storeOverviewOpen'))}
        {tile(ListTree, t('menus'), s ? t('storeOverviewMenus', { n: num(s.menus) }) : t('menus.d'), '/online-store/menus', t('storeOverviewOpen'), s && s.broken > 0 ? <Badge tone="warning">{t('menuBrokenCount', { n: num(s.broken) })}</Badge> : undefined)}
        {tile(Settings2, t('preferences'), t('preferences.d'), '/online-store/preferences', t('storeOverviewOpen'))}
      </div>
    </div>
  )
}
