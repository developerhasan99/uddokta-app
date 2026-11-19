import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, FileText, ImageOff } from 'lucide-react'
import { DialogHead } from '../components/DialogHead'
import { useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Button, Field } from '../components/ui'
import { ProductPicker, type ProductRow } from '../components/ProductPicker'
import { errorLabel, useLang } from '../i18n'
import { useDialog } from '../components/dialog'

// A published demo from the console (GET /demos): names are [Bangla, English].
export type DemoCard = { id: string; name: [string, string]; category: string; thumb: string | null; previewUrl: string | null }

// The gallery of demos, with a first card for starting from nothing. Categories filter it once there are several.
export function DemoGallery({ demos, chosen, onChoose, blank }: { demos: DemoCard[]; chosen: string | null; onChoose: (id: string | null) => void; blank?: { title: string; help: string } }) {
  const { lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const [category, setCategory] = useState('')
  const categories = [...new Set(demos.map((d) => d.category).filter(Boolean))]
  const shown = demos.filter((d) => !category || d.category === category)
  return <div className="demo-gallery">
    {categories.length > 1 && <div className="demo-gallery__filters" role="group" aria-label={L(['ধরন', 'Category'])}>
      {['', ...categories].map((c) => <button key={c || 'all'} type="button" className="tab" aria-pressed={category === c} onClick={() => setCategory(c)}>{c || L(['সব', 'All'])}</button>)}
    </div>}
    <ul className="demo-gallery__grid">
      {blank && <li><button type="button" className="demo-card" aria-pressed={chosen === null} onClick={() => onChoose(null)}>
        <span className="demo-card__thumb demo-card__thumb--blank"><FileText size={22} strokeWidth={1.5} aria-hidden="true" /></span>
        <span className="demo-card__name">{blank.title}</span><span className="demo-card__meta">{blank.help}</span>
      </button></li>}
      {shown.map((d) => <li key={d.id}>
        <button type="button" className="demo-card" aria-pressed={chosen === d.id} onClick={() => onChoose(d.id)}>
          {d.thumb ? <img className="demo-card__thumb" src={d.thumb} alt="" loading="lazy" /> : <span className="demo-card__thumb demo-card__thumb--blank"><ImageOff size={20} strokeWidth={1.5} aria-hidden="true" /></span>}
          <span className="demo-card__name">{L(d.name)}</span>{d.category && <span className="demo-card__meta">{d.category}</span>}
        </button>
        {d.previewUrl && <a className="demo-card__preview" href={d.previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`${L(['দেখুন', 'Preview'])}: ${L(d.name)}`} title={L(['নতুন ট্যাবে দেখুন', 'Preview in a new tab'])}><ExternalLink size={14} aria-hidden="true" /></a>}
      </li>)}
    </ul>
  </div>
}

// New landing page: a name, then a blank canvas or a demo made by the Uddokta team (a copy in this store, with the
// seller's own product in place of the demo's).
export function NewCampaignDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang()
  const L = (label: readonly [string, string]) => label[lang === 'bn' ? 0 : 1]
  const navigate = useNavigate()
  const path = useStorePath()
  const handle = useCurrentStore()!.store.handle
  const { ref: dialog, close, props: dialogProps } = useDialog(onClose)
  const submitting = useRef(false)
  const [title, setTitle] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demos, setDemos] = useState<DemoCard[]>([])
  const [demo, setDemo] = useState<string | null>(null)
  const [product, setProduct] = useState<ProductRow | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLInputElement>('#campaign-title')?.focus()
    // No demos (or no connection) simply leaves the blank canvas.
    api<DemoCard[]>('/demos?kind=landing').then(setDemos, () => {})
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
      const body = demo ? { title, demo, ...(product ? { productId: product.id } : {}) } : { title, blank: true }
      const page = await api<{ id: string }>(`/stores/${handle}/pages`, { method: 'POST', body })
      navigate(path(`/landing-pages/${page.id}`))
    } catch (err) {
      setError(errorCode(err))
      setBusy(false)
      submitting.current = false
    }
  }

  // The picker sits beside the dialog, not in it: events inside it must not reach this dialog's close handlers.
  return <><dialog {...dialogProps} className={`modal campaign-dialog${demos.length ? ' campaign-dialog--demos' : ''}`} aria-labelledby="campaign-title-heading" onCancel={(e) => { e.preventDefault(); if (!submitting.current) close() }}>
    <form className="campaign-dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <DialogHead id="campaign-title-heading" title={t('campaignName')} disabled={busy} onClose={() => close()} />
      <div className="dialog__body">
        <Field id="campaign-title" label={t('pageTitle')} placeholder={t('pageTitleHint')} help={t('pageTitleHelp')} maxLength={200} autoComplete="off" value={title} disabled={busy} error={tried && !title.trim() ? t('errNameRequired') : undefined} onChange={(e) => setTitle(e.target.value)} />
        {demos.length > 0 ? <fieldset className="campaign-dialog__start" disabled={busy}>
          <legend className="field__label">{L(['কোথা থেকে শুরু', 'Start from'])}</legend>
          <DemoGallery demos={demos} chosen={demo} onChoose={setDemo} blank={{ title: L(['ফাঁকা পেজ', 'Blank page']), help: L(['শূন্য থেকে নিজের মতো সাজান', 'Build your own from nothing']) }} />
        </fieldset> : <p className="muted">{t('campaignBlankDraftHelp')}</p>}
        {demo && <div className="campaign-dialog__product">
          <div>
            <span className="field__label">{L(['কোন পণ্য বিক্রি করবেন?', 'Which product does it sell?'])}</span>
            <p className="field__help">{product ? product.name : L(['ডেমোর পণ্যের জায়গায় এটি বসবে। পরে এডিটরেও বেছে নিতে পারবেন।', 'It takes the place of the demo’s product. You can also choose it later in the editor.'])}</p>
          </div>
          <div className="campaign-dialog__product-actions">
            {product && <Button disabled={busy} onClick={() => setProduct(null)}>{L(['সরান', 'Remove'])}</Button>}
            <Button disabled={busy} onClick={() => setPicking(true)}>{product ? L(['বদলান', 'Change']) : L(['পণ্য বাছুন', 'Choose product'])}</Button>
          </div>
        </div>}
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
      </div>
      <footer className="dialog__foot dialog__foot--split">
        <Button disabled={busy} onClick={() => close()}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{t('campaignCreateDraft')}</Button>
      </footer>
    </form>
  </dialog>
  {picking && <ProductPicker sellableOnly selected={product ? [product] : []} max={1} onClose={() => setPicking(false)} onDone={(items) => { setProduct(items[0] ?? null); setPicking(false) }} />}
  </>
}
