import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { DialogHead } from '../components/DialogHead'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Field } from '../components/ui'
import { errorLabel, useLang } from '../i18n'
import { useDialog } from '../components/dialog'

// New landing page: a name, then a blank canvas in the editor. Ready-made templates were retired.
export function NewCampaignDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const submitting = useRef(false)
  const [title, setTitle] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLInputElement>('#campaign-title')?.focus()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    setTried(true)
    if (!title.trim()) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const page = await api<{ id: string }>(`/stores/${handle}/pages`, { method: 'POST', body: { title, blank: true } })
      navigate(path(`/landing-pages/${page.id}`))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
      submitting.current = false
    }
  }

  return <dialog {...dialogProps} className="modal campaign-dialog" aria-labelledby="campaign-title-heading" onCancel={(e) => { e.preventDefault(); if (!submitting.current) close() }}>
    <form className="campaign-dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <DialogHead id="campaign-title-heading" title={t('campaignName')} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        <Field id="campaign-title" label={t('pageTitle')} placeholder={t('pageTitleHint')} help={t('pageTitleHelp')} maxLength={200} autoComplete="off" value={title} disabled={busy} error={tried && !title.trim() ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />
        <p className="muted">{t('campaignBlankDraftHelp')}</p>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('campaignCreateDraft')}</Button>
      </footer>
    </form>
  </dialog>
}
