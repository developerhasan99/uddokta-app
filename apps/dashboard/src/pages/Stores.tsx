import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { createStore, type Failure } from '../account'
import { useAccount } from '../account-context'
import { roleLabels, StoreMark } from '../components/AppMenu'
import { Badge, Button, Field, LinkButton, Notice, PageHeader } from '../components/ui'
import { useLang, type Key } from '../i18n'

export const failureLabels: Record<Failure, Key> = {
  nameRequired: 'errNameRequired',
  handleInvalid: 'errHandleInvalid',
  handleTaken: 'errHandleTaken',
  emailInvalid: 'errEmailInvalid',
  alreadyMember: 'errAlreadyMember',
  lastOwner: 'errLastOwner',
}

export function Stores() {
  const { t } = useLang()
  const { myStores, reset } = useAccount()
  const [params] = useSearchParams()
  const preview = params.get('preview') ?? ''
  const stores = preview === 'empty' ? [] : myStores

  return (
    <div className="page page--narrow">
      <PageHeader
        title={t('myStores')}
        description={t('storesD')}
        action={stores.length > 0 && <LinkButton to="/stores/new" variant="primary">{t('createStore')}</LinkButton>}
      />

      <div className="sample-note">
        <Badge>{t('sampleData')}</Badge>
        <p className="muted">{t('sampleAccountNote')}</p>
        <div className="sample-note__states" role="group" aria-label={t('previewState')}>
          <Link to="/stores" className="tab" aria-current={!preview ? 'true' : undefined}>{t('stateFull')}</Link>
          <Link to="/stores?preview=empty" className="tab" aria-current={preview ? 'true' : undefined}>{t('stateEmpty')}</Link>
          <Button onClick={reset}>{t('resetSample')}</Button>
        </div>
      </div>

      <section className="card card--flush">
        {stores.length === 0
          ? <Notice title={t('noStoreTitle')} body={t('noStoreBody')} action={<LinkButton to="/stores/new" variant="primary">{t('createStore')}</LinkButton>} />
          : (
            <ul className="store-list">
              {stores.map(({ store, role }) => (
                <li key={store.id}>
                  <Link to={`/store/${store.handle}`} className="store-row">
                    <StoreMark name={store.name} />
                    <span className="store-row__text">
                      <strong>{store.name}</strong>
                      <span className="muted">{store.handle}</span>
                    </span>
                    <Badge>{t(roleLabels[role])}</Badge>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}

const suggestHandle = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function NewStore() {
  const { t } = useLang()
  const { account, apply, me } = useAccount()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleEdited, setHandleEdited] = useState(false)
  const [error, setError] = useState<Failure | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const failure = apply(createStore(account, me.id, name, handle))
    setError(failure)
    if (!failure) navigate(`/store/${handle.trim().toLowerCase()}`)
  }

  return (
    <div className="page page--form">
      <PageHeader title={t('createStore')} description={t('newStoreD')} />
      <form className="card" onSubmit={submit} noValidate>
        <Field
          id="store-name"
          name="name"
          label={t('storeNameLabel')}
          autoComplete="organization"
          value={name}
          error={error === 'nameRequired' ? t('errNameRequired') : undefined}
          onChange={(e) => {
            setName(e.target.value)
            if (!handleEdited) setHandle(suggestHandle(e.target.value))
          }}
        />
        <Field
          id="store-handle"
          name="handle"
          label={t('handleLabel')}
          autoComplete="off"
          value={handle}
          help={t('handleHelp')}
          error={error === 'handleInvalid' || error === 'handleTaken' ? t(failureLabels[error]) : undefined}
          onChange={(e) => {
            setHandle(e.target.value)
            setHandleEdited(true)
          }}
        />
        <div className="row">
          <Button type="submit" variant="primary">{t('createStore')}</Button>
          <LinkButton to="/stores">{t('cancel')}</LinkButton>
        </div>
      </form>
    </div>
  )
}
