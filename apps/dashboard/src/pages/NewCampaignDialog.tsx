import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { campaignTemplates, type CampaignTemplate } from 'storefront/campaigns'
import { defOf } from 'storefront/schema'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { ProductPicker, type ProductRow } from '../components/ProductPicker'
import { Button, Field } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

export function NewCampaignDialog({ onClose }: { onClose: () => void }) {
  const { t, lang, num } = useLang()
  const navigate = useNavigate()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [step, setStep] = useState(1)
  const [template, setTemplate] = useState<CampaignTemplate | 'blank'>('quick')
  const [product, setProduct] = useState<ProductRow | null>(null)
  const [picking, setPicking] = useState(false)
  const [title, setTitle] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labelIndex = lang === 'bn' ? 0 : 1
  const chosen = campaignTemplates.find((item) => item.id === template)

  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    if (step === 2) dialog.current?.querySelector<HTMLInputElement>('#campaign-title')?.focus()
  }, [step])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    setTried(true)
    if (step === 1) {
      if (template !== 'blank' && !product) return
      if (!title.trim() && product && template !== 'blank') setTitle(product.name.slice(0, 200))
      setTried(false)
      setStep(2)
      return
    }
    if (!title.trim() || (template !== 'blank' && !product)) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const page = await api<{ id: string }>(`/stores/${handle}/pages`, {
        method: 'POST', body: template === 'blank' ? { title, blank: true } : { title, template, productId: product!.id, lang },
      })
      navigate(path(`/landing-pages/${page.id}`))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
      submitting.current = false
    }
  }

  return <>
    <dialog ref={dialog} className="modal campaign-dialog" aria-labelledby="campaign-title-heading" onClose={onClose} onCancel={(e) => { if (submitting.current) e.preventDefault() }}>
      <form className="campaign-dialog__form" onSubmit={(e) => void submit(e)} noValidate>
        <header className="campaign-dialog__header">
          <div><p className="muted">{t('campaignStep', { n: num(step) })}</p><h2 id="campaign-title-heading">{t(step === 1 ? 'campaignStart' : 'campaignName')}</h2></div>
          <button type="button" className="media__dismiss" disabled={busy} aria-label={t('mediaClose')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="campaign-dialog__body">
          {step === 1 ? <>
            <fieldset className="campaign-layouts"><legend>{t('campaignLayout')}</legend>
              {campaignTemplates.map((item) => <label key={item.id} className="campaign-layout" data-selected={template === item.id}>
                <input type="radio" name="campaign-layout" value={item.id} checked={template === item.id} onChange={() => setTemplate(item.id)} />
                <span className="campaign-layout__copy"><strong>{item.name[labelIndex]}</strong><span className="muted">{item.description[labelIndex]}</span></span>
                <span className="campaign-layout__diagram" aria-hidden="true">{item.sections.map((section) => <span key={section} data-section={section} />)}</span>
              </label>)}
              <label className="campaign-layout" data-selected={template === 'blank'}>
                <input type="radio" name="campaign-layout" value="blank" checked={template === 'blank'} onChange={() => setTemplate('blank')} />
                <span className="campaign-layout__copy"><strong>{t('campaignBlank')}</strong><span className="muted">{t('campaignBlankHelp')}</span></span>
              </label>
            </fieldset>
            {template !== 'blank' && <section className="campaign-product">
              <h3>{t('campaignProduct')}</h3><p className="muted">{t('campaignProductHelp')}</p>
              {product && <div className="campaign-product__chosen"><span className="data-table__thumb">{product.thumbUrl && <img src={product.thumbUrl} alt="" />}</span><strong>{product.name}</strong><Check size={16} aria-hidden="true" /></div>}
              <Button onClick={() => setPicking(true)}>{t(product ? 'campaignChangeProduct' : 'campaignChooseProduct')}</Button>
              {tried && !product && <p className="form-error" role="alert">{t('campaignProductRequired')}</p>}
            </section>}
          </> : <>
            <Field id="campaign-title" label={t('pageTitle')} placeholder={t('pageTitleHint')} help={t('pageTitleHelp')} maxLength={200} autoComplete="off" value={title} disabled={busy} error={tried && !title.trim() ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />
            <section className="campaign-summary">
              <h3>{t('campaignSummary')}</h3>
              <p><strong>{chosen ? chosen.name[labelIndex] : t('campaignBlank')}</strong>{chosen && product && <span className="table__sub">{product.name}</span>}</p>
              {chosen && <ol>{chosen.sections.map((type) => <li key={type}>{defOf(type).label[labelIndex]}</li>)}</ol>}
              <p className="muted">{t(chosen ? 'campaignDraftHelp' : 'campaignBlankDraftHelp')}</p>
            </section>
          </>}
          {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        </div>
        <footer className="campaign-dialog__footer">
          <Button disabled={busy} onClick={() => { if (step === 1) onClose(); else { setStep(1); setTried(false); setError(null) } }}>{step === 2 && <ArrowLeft size={14} aria-hidden="true" />}{t(step === 1 ? 'cancel' : 'campaignBack')}</Button>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t(step === 1 ? 'campaignContinue' : 'campaignCreateDraft')}{step === 1 && <ArrowRight size={14} aria-hidden="true" />}</Button>
        </footer>
      </form>
    </dialog>
    {picking && <ProductPicker sellableOnly selected={product ? [product] : []} max={1} onDone={(items) => { setProduct(items[0] ?? null); setPicking(false) }} onClose={() => setPicking(false)} />}
  </>
}
