import { ExternalLink } from 'lucide-react'
import { useCurrentStore, useStorePath } from '../account-context'
import { storefrontUrl } from '../api'
import { LinkButton, PageHeader } from '../components/ui'
import { useLang } from '../i18n'

export function OnlineStore() {
  const { t } = useLang()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const url = storefrontUrl(handle)
  return (
    <div className="page page--narrow">
      <PageHeader title={t('onlineStore')} description={t('onlineStore.d')} action={<a className="btn btn--primary" href={url} target="_blank" rel="noopener"><ExternalLink size={16} aria-hidden="true" />{t('viewStore')}</a>} />
      <section className="card">
        <h2>{t('storeAddressTitle')}</h2>
        <p><a href={url} target="_blank" rel="noopener">{url}</a></p>
        <p className="muted">{t('storeAddressHelp')}</p>
      </section>
      <section className="card">
        <h2>{t('landingPages')}</h2>
        <p className="muted">{t('landingPages.d')}</p>
        <div className="row"><LinkButton to={path('/landing-pages')}>{t('landingPagesOpen')}</LinkButton></div>
      </section>
    </div>
  )
}
