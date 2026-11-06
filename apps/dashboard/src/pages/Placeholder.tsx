import { useStorePath } from '../account-context'
import { Badge, LinkButton, Notice, PageHeader } from '../components/ui'
import { useLang, type Key } from '../i18n'
export function Placeholder({ item }: { item: Key }) {
  const { t } = useLang()
  const path = useStorePath()
  return (
    <div className="page page--narrow planned-feature-page">
      <PageHeader title={t(item)} description={t('plannedFeatureIntro')} />
      <section className="card planned-feature">
        <div><Badge>{t('comingSoon')}</Badge></div>
        <h2>{t('plannedFeatureScope')}</h2>
        <p>{t(`${item}.d` as Key)}</p>
        <p className="muted">{t(item === 'pages' ? 'plannedStorePagesHelp' : 'plannedFeatureHelp')}</p>
        <div className="row"><LinkButton to={path(item === 'pages' ? '/landing-pages' : '/')}>{t(item === 'pages' ? 'landingPagesOpen' : 'backHome')}</LinkButton></div>
      </section>
    </div>
  )
}

export function NotFound() {
  const { t } = useLang()
  return (
    <div className="page page--narrow">
      <PageHeader title={t('notFound')} />
      <section className="card card--flush">
        <Notice title={t('notFound')} body={t('notFoundBody')} action={<LinkButton to="/">{t('backHome')}</LinkButton>} />
      </section>
    </div>
  )
}
