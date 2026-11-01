import { LinkButton, Notice, PageHeader } from '../components/ui'
import { useLang, type Key } from '../i18n'
export function Placeholder({ item }: { item: Key }) {
  const { t } = useLang()
  return (
    <div className="page page--narrow">
      <PageHeader title={t(item)} description={t(`${item}.d` as Key)} />
      <section className="card card--flush">
        <Notice title={t('notBuilt')} />
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
