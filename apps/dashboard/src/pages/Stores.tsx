import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useAccount } from '../account-context'
import { api, errorCode } from '../api'
import { roleLabels, StoreMark } from '../components/AppMenu'
import { Badge, Button, Field, LinkButton, Notice, PageHeader } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

export function Stores() {
  const { t } = useLang()
  const { myStores } = useAccount()

  return (
    <div className="page page--narrow">
      <PageHeader
        title={t('myStores')}
        description={t('storesD')}
        action={myStores.length > 0 && <LinkButton to="/stores/new" variant="primary">{t('createStore')}</LinkButton>}
      />

      <section className="card card--flush">
        {myStores.length === 0
          ? <Notice title={t('noStoreTitle')} body={t('noStoreBody')} action={<LinkButton to="/stores/new" variant="primary">{t('createStore')}</LinkButton>} />
          : (
            <ul className="store-list">
              {myStores.map(({ store, role }) => (
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
  const { refresh } = useAccount()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleEdited, setHandleEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const store = await api<{ handle: string }>('/stores', { method: 'POST', body: { name, handle } })
      await refresh()
      navigate(`/store/${store.handle}`)
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
    }
  }

  const isFieldError = error === 'nameRequired' || error === 'handleInvalid' || error === 'handleTaken'

  return (
    <div className="page page--form">
      <PageHeader title={t('createStore')} description={t('newStoreD')} />
      <form className="card" onSubmit={submit} noValidate>
        {error && !isFieldError && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <Field
          id="store-name"
          name="name"
          label={t('storeNameLabel')}
          autoComplete="organization"
          value={name}
          error={error === 'nameRequired' ? t(errorLabel(error)) : undefined}
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
          error={error === 'handleInvalid' || error === 'handleTaken' ? t(errorLabel(error)) : undefined}
          onChange={(e) => {
            setHandle(e.target.value)
            setHandleEdited(true)
          }}
        />
        <div className="row">
          <Button type="submit" variant="primary" aria-busy={busy}>{t('createStore')}</Button>
          <LinkButton to="/stores">{t('cancel')}</LinkButton>
        </div>
      </form>
    </div>
  )
}
